'use strict';
// Worker API against a real SQLite (node:sqlite) D1 shim. Synthetic secrets/data only; nothing printed.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
function d1(){const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(path.join(root,'worker/schema.sql'),'utf8'));
 return{prepare(sql){let args=[];const st={bind(...a){args=a;return st;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return{results:db.prepare(sql).all(...args)};},async run(){const r=db.prepare(sql).run(...args);return{meta:{changes:Number(r.changes)}};}};return st;},raw:db};}
const ORIGIN='https://api.example';
(async()=>{
const {handle}=await import(path.join(root,'worker/index.mjs'));const {ConsentKdf}=require(path.join(root,'server-reservations.js'));
const rnd=()=>crypto.randomBytes(24).toString('base64url');
const env={DB:d1(),PEPPER:rnd()+rnd(),SETUP_TOKEN:rnd()+rnd(),SETUP_UNTIL:String(1_800_000_000_000+86400e3)};const PW='Synthetic-'+rnd();let KEY;
let t=1_800_000_000_000;
const call=async(method,p,{body,token,origin=ORIGIN,ip='198.51.100.7',now=t,xrw='consent'}={})=>{const h={'CF-Connecting-IP':ip};if(origin)h.Origin=origin;if(xrw)h['X-Requested-With']=xrw;if(body!==undefined)h['Content-Type']='application/json';if(token)h['Cookie']='__Host-lcr_sid='+token;const r=await handle(new Request('https://api.example'+p,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)}),env,now);const sc=r.headers.get('Set-Cookie')||'';const m=sc.match(/__Host-lcr_sid=([A-Za-z0-9_-]{43})/);if(sc)assert.match(sc,/; Path=\/; Secure; HttpOnly; SameSite=Strict; Max-Age=\d+$/);const j=await r.json().catch(()=>null);if(j)assert(!JSON.stringify(j).match(/[A-Za-z0-9_-]{43}/),'no token in body');return{s:r.status,h:r.headers,j,cookie:m?m[1]:null};};
KEY=await ConsentKdf.derive('admin',PW);const BAD=await ConsentKdf.derive('admin','wrong-password-x');
assert.equal(KEY.length,43);assert.equal(KEY,await ConsentKdf.derive(' Admin ',PW),'username normalised');
// closed by default
assert.equal((await handle(new Request('https://x/api/status'),{DB:env.DB},t)).status,503,'no pepper -> closed');
let r=await call('GET','/api/status');assert.equal(r.j.configured,false);assert.equal(r.h.get('Cache-Control'),'no-store');assert.equal(r.h.get('Access-Control-Allow-Origin'),null,'no CORS');assert.equal(r.j.setupOpen,true);assert.equal(r.h.get('X-Frame-Options'),'DENY');
for(const [m,p] of [['GET','/api/reservations'],['POST','/api/login']])assert.equal((await call(m,p,{body:m==='POST'?{username:'admin',key:KEY}:undefined})).s,503);
assert.equal((await call('GET','/api/status',{origin:'https://evil.example'})).s,403,'foreign origin');
// CSRF: state changes need same Origin + X-Requested-With
assert.equal((await call('POST','/api/setup',{body:{token:env.SETUP_TOKEN,username:'admin',key:KEY},xrw:null})).s,403);
assert.equal((await call('POST','/api/setup',{body:{token:env.SETUP_TOKEN,username:'admin',key:KEY},origin:null})).s,403);
// setup window: closed without token, without/expired/over-24h SETUP_UNTIL
for(const e of [{SETUP_TOKEN:undefined},{SETUP_UNTIL:undefined},{SETUP_UNTIL:String(t-1)},{SETUP_UNTIL:String(t+48*3600e3)},{SETUP_TOKEN:'short'}]){const saved={...env};Object.assign(env,e);const st=await call('GET','/api/status');assert.equal(st.j.setupOpen,false);assert.equal((await call('POST','/api/setup',{body:{token:saved.SETUP_TOKEN,username:'admin',key:KEY}})).j.error,'setup_closed');Object.assign(env,saved);}
// setup needs token; first visitor cannot claim
assert.equal((await call('POST','/api/setup',{body:{token:'x',username:'admin',key:KEY}})).s,401);
assert.equal((await call('POST','/api/setup',{body:{token:env.SETUP_TOKEN,username:'admin',key:'short'}})).s,400);
r=await call('POST','/api/setup',{body:{token:env.SETUP_TOKEN,username:'admin',key:KEY}});assert.equal(r.s,201);assert(r.cookie);assert.equal((await call('GET','/api/status')).j.setupOpen,false);
assert.equal((await call('POST','/api/setup',{body:{token:env.SETUP_TOKEN,username:'admin',key:KEY}})).s,410,'setup one-time');
const adminRow=env.DB.raw.prepare('SELECT * FROM admin').get();assert(!JSON.stringify(adminRow).includes(PW)&&!JSON.stringify(adminRow).includes(KEY));assert.equal(adminRow.hash.length,64);assert.equal(adminRow.iter,600000);assert.equal(adminRow.salt.length,32);
// auth required everywhere
for(const [m,p] of [['GET','/api/reservations'],['POST','/api/reservations'],['GET','/api/reservations/00000000-0000-4000-8000-000000000000'],['POST','/api/logout']])assert.equal((await call(m,p,{body:m==='POST'?{}:undefined})).s,401,m+p);
assert.equal((await call('GET','/api/reservations',{token:'A'.repeat(43)})).s,401);
assert.equal((await call('GET','/api/reservations',{origin:'https://evil.example'})).s,403);
// wrong password + throttling
for(let i=0;i<5;i++)assert.equal((await call('POST','/api/login',{body:{username:'admin',key:BAD}})).s,401);
assert.equal((await call('POST','/api/login',{body:{username:'admin',key:KEY}})).s,429,'locked after 5 fails');
assert.equal((await call('POST','/api/login',{body:{username:'admin',key:KEY},ip:'198.51.100.8'})).s,200,'other device ok');
// two independent sessions (PC + tablet)
const pc=(await call('POST','/api/login',{body:{username:'admin',key:KEY},ip:'203.0.113.10'})).cookie;
const tab=(await call('POST','/api/login',{body:{username:'admin',key:KEY},ip:'203.0.113.11'})).cookie;
assert.equal((await call('PUT','/api/reservations/00000000-0000-4000-8000-000000000000',{token:pc,body:{},xrw:null})).s,403,'csrf on authed write');
// CPU: one 100k PBKDF2 login in Node (reported, not a Workers measurement)
{const a=process.cpuUsage();await call('POST','/api/login',{body:{username:'admin',key:KEY},ip:'203.0.113.12'});const u=process.cpuUsage(a);assert((u.user+u.system)/1000<10,'server login CPU < 10 ms in node');}
assert.notEqual(pc,tab);
const rec={no:'TEST-RES-0001',name:'TEST USER',phone:'+1 555 0100',email:'test.user@example.invalid'};
r=await call('POST','/api/reservations',{token:pc,body:rec});assert.equal(r.s,201);const id=r.j.id;
r=await call('GET','/api/reservations',{token:tab});assert.equal(r.s,200);assert.equal(r.j.items.length,1);assert.equal(r.j.items[0].label,'TE••••••••001 · T•••••••R');{const vis=JSON.stringify(r.j.items.map(({id,...x})=>x));assert(!vis.includes('555')&&!vis.includes('example.invalid')&&!vis.includes('TEST USER'),'list masked');}
r=await call('GET','/api/reservations/'+id,{token:tab});assert.deepEqual({no:r.j.no,name:r.j.name,phone:r.j.phone,email:r.j.email},rec);
// validation: card fields / card-like values / unknown keys rejected
assert.equal((await call('POST','/api/reservations',{token:pc,body:{...rec,cardNumber:'4111111111111111'}})).j.error,'field:cardNumber');
assert.equal((await call('POST','/api/reservations',{token:pc,body:{...rec,phone:'4111 1111 1111 1111'}})).j.error,'card:phone');
assert.equal((await call('POST','/api/reservations',{token:pc,body:{name:'X'}})).j.error,'required');
assert.equal((await call('POST','/api/reservations',{token:pc,body:{...rec,no:"x'); DROP TABLE reservations;--"}})).s,201,'parameterized');
assert.equal(env.DB.raw.prepare('SELECT count(*) c FROM reservations').get().c,2);
// stale edit
r=await call('PUT','/api/reservations/'+id,{token:tab,body:{...rec,phone:'+82 10 0000 0000',version:1}});assert.equal(r.s,200);assert.equal(r.j.version,2);
assert.equal((await call('PUT','/api/reservations/'+id,{token:pc,body:{...rec,version:1}})).s,409,'stale edit rejected');
assert.equal((await call('DELETE','/api/reservations/'+id+'?version=1',{token:pc})).s,409);
assert.equal((await call('DELETE','/api/reservations/'+id+'?version=2',{token:pc})).s,200);
assert.equal((await call('GET','/api/reservations/'+id,{token:tab})).s,404);
// pagination
for(let i=0;i<120;i++){t+=1;await call('POST','/api/reservations',{token:pc,body:{no:'TEST-'+i,name:'TEST USER '+i},now:t});}
let seen=0,cur=null,pages=0;do{r=await call('GET','/api/reservations?limit=50'+(cur?'&cursor='+encodeURIComponent(cur):''),{token:tab,now:t});seen+=r.j.items.length;cur=r.j.next;pages++;}while(cur);assert.equal(seen,121);assert.equal(pages,3);
// session expiry & logout
assert.equal((await call('GET','/api/reservations',{token:pc,now:t+31*60e3})).s,401,'idle expiry');
{const lo=await call('POST','/api/logout',{token:tab,now:t});assert.equal(lo.s,200);assert.match(lo.h.get('Set-Cookie'),/Max-Age=0$/);}assert.equal((await call('GET','/api/reservations',{token:tab,now:t})).s,401,'logged out');
// password change: wrong current -> no change; success -> fresh salt, ALL sessions revoked; short (4) passwords accepted
{const s1=(await call('POST','/api/login',{body:{username:'admin',key:KEY},ip:'203.0.113.20',now:t})).cookie,s2=(await call('POST','/api/login',{body:{username:'admin',key:KEY},ip:'203.0.113.21',now:t})).cookie;
 assert.equal((await call('GET','/api/session',{token:s1,now:t})).j.username,'admin');
 const NEW=await ConsentKdf.derive('admin','4321');const before=env.DB.raw.prepare('SELECT salt,hash FROM admin').get();
 assert.equal((await call('POST','/api/password',{body:{current:KEY,next:NEW},now:t})).s,401,'unauthenticated');
 assert.equal((await call('POST','/api/password',{token:s1,body:{current:KEY,next:NEW},xrw:null,now:t})).s,403,'csrf');
 assert.equal((await call('POST','/api/password',{token:s1,body:{current:BAD,next:NEW},ip:'203.0.113.20',now:t})).j.error,'bad_current');
 assert.deepEqual(env.DB.raw.prepare('SELECT salt,hash FROM admin').get(),before,'wrong current: no change');
 assert.equal((await call('POST','/api/password',{token:s1,body:{current:KEY,next:'x'},ip:'203.0.113.20',now:t})).j.error,'key');
 const ch=await call('POST','/api/password',{token:s1,body:{current:KEY,next:NEW},ip:'203.0.113.20',now:t});assert.equal(ch.s,200);assert.match(ch.h.get('Set-Cookie'),/Max-Age=0$/);
 const after=env.DB.raw.prepare('SELECT salt,hash FROM admin').get();assert.notEqual(after.salt,before.salt);assert.notEqual(after.hash,before.hash);
 assert.equal(env.DB.raw.prepare('SELECT count(*) c FROM sessions').get().c,0);
 for(const c of [s1,s2])assert.equal((await call('GET','/api/reservations',{token:c,now:t})).s,401,'old sessions revoked');
 assert.equal((await call('POST','/api/login',{body:{username:'admin',key:KEY},ip:'203.0.113.22',now:t})).s,401,'old password dead');
 assert.equal((await call('POST','/api/login',{body:{username:'admin',key:NEW},ip:'203.0.113.22',now:t})).s,200,'new 4-char password works');}
// global cap: 20 failures from many IPs -> global lock 1h
{for(let i=0;i<20;i++)await call('POST','/api/login',{body:{username:'admin',key:BAD},ip:'192.0.2.'+i,now:t});
 assert.equal((await call('POST','/api/login',{body:{username:'admin',key:KEY},ip:'192.0.2.200',now:t})).s,429,'global lock');
 assert.equal((await call('POST','/api/login',{body:{username:'admin',key:await ConsentKdf.derive('admin','4321')},ip:'192.0.2.200',now:t+61*60e3})).s,200,'unlocks after 1h');}
// setup race: two concurrent setups -> exactly one admin
{const e2={DB:d1(),PEPPER:env.PEPPER,SETUP_TOKEN:env.SETUP_TOKEN,SETUP_UNTIL:String(t+3600e3)};const mk=k=>handle(new Request('https://api.example/api/setup',{method:'POST',headers:{Origin:ORIGIN,'X-Requested-With':'consent','Content-Type':'application/json'},body:JSON.stringify({token:e2.SETUP_TOKEN,username:'admin',key:k})}),e2,t);
 const rs=await Promise.all([mk(KEY),mk(BAD),mk(KEY)]);assert.deepEqual(rs.map(r=>r.status).sort(),[201,410,410]);assert.equal(e2.DB.raw.prepare('SELECT count(*) c FROM admin').get().c,1);}
// Korean usernames (isolated DB): NFC, Hangul syllables + ASCII . _ -, 2-32; compat with ASCII derivation
{assert.equal(await ConsentKdf.derive('admin',PW),KEY,'ASCII derivation unchanged');
 const mkEnv=()=>({DB:d1(),PEPPER:env.PEPPER,SETUP_TOKEN:env.SETUP_TOKEN,SETUP_UNTIL:String(t+3600e3)});
 const req=(e,p,body,cookie)=>handle(new Request('https://api.example'+p,{method:'POST',headers:{Origin:ORIGIN,'X-Requested-With':'consent','Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),'CF-Connecting-IP':'198.51.100.99'},body:JSON.stringify(body)}),e,t);
 const SYN='Syn-'+rnd();
 for(const bad of ['김','관 리자','관리자😀','ㄱㄴㄷ','관리자\u200b','x'.repeat(33),'관리자\u0000','аdmin','관리자!','\ud800ab']){const e=mkEnv();const r=await req(e,'/api/setup',{token:e.SETUP_TOKEN,username:bad,key:KEY});assert.equal(r.status,400,'reject '+JSON.stringify(bad));assert.equal((await r.json()).error,'username');}
 for(const good of ['관리','관리자','김해.지점_01-a','가'.repeat(32),'ab']){const e=mkEnv();assert.equal((await req(e,'/api/setup',{token:e.SETUP_TOKEN,username:good,key:await ConsentKdf.derive(good,SYN)})).status,201,good);}
 const e=mkEnv();const composed='관리자',decomposed=composed.normalize('NFD');assert.notEqual(composed,decomposed);
 assert.equal(await ConsentKdf.derive(decomposed,SYN),await ConsentKdf.derive(composed,SYN),'NFC alias same key');
 assert.equal((await req(e,'/api/setup',{token:e.SETUP_TOKEN,username:decomposed,key:await ConsentKdf.derive(decomposed,SYN)})).status,201);
 assert.equal(e.DB.raw.prepare('SELECT username FROM admin').get().username,composed,'stored NFC');
 const lg=await req(e,'/api/login',{username:composed,key:await ConsentKdf.derive(composed,SYN)});assert.equal(lg.status,200);
 assert.equal((await req(e,'/api/login',{username:decomposed,key:await ConsentKdf.derive(decomposed,SYN)})).status,200,'NFD login alias');
 assert.equal((await req(e,'/api/login',{username:'관리자 ',key:await ConsentKdf.derive(composed,SYN)})).status,200,'trim');
 assert.equal((await req(e,'/api/login',{username:'관리',key:await ConsentKdf.derive('관리',SYN)})).status,401,'other name');
 const ck=lg.headers.get('Set-Cookie').split(';')[0];
 const NEW2=await ConsentKdf.derive(composed,'Syn2-'+rnd());
 assert.equal((await req(e,'/api/password',{current:await ConsentKdf.derive(composed,SYN),next:NEW2},ck)).status,200,'korean pw change');
 assert.equal((await req(e,'/api/login',{username:composed,key:NEW2})).status,200);}
// storage contains only allowed columns
assert.deepEqual(env.DB.raw.prepare('PRAGMA table_info(reservations)').all().map(c=>c.name),['id','res_no','name','phone','email','version','created_at','updated_at']);
const src=fs.readFileSync(path.join(root,'worker/index.mjs'),'utf8');assert(!/console\./.test(src),'no logging');assert(!/Access-Control-Allow/.test(src),'no CORS');
console.log('PASS: closed-by-default, one-time token setup, auth on all routes, throttle, 2 independent sessions share data, masked list, schema allowlist/card rejection, SQL params, stale-edit 409, pagination, idle expiry/logout, no logs, cookie HttpOnly/Strict, CSRF, setup window');
})().catch(e=>{console.error(e.message);process.exit(1);});
