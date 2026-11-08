'use strict';
// Worker API against a real SQLite (node:sqlite) D1 shim. Synthetic secrets/data only; nothing printed.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
function d1(){const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(path.join(root,'worker/schema.sql'),'utf8'));
 return{prepare(sql){let args=[];const st={bind(...a){args=a;return st;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return{results:db.prepare(sql).all(...args)};},async run(){const r=db.prepare(sql).run(...args);return{meta:{changes:Number(r.changes)}};}};return st;},raw:db};}
const ORIGIN='https://api.example';
(async()=>{
const {handle}=await import(path.join(root,'worker/index.mjs'));
const rnd=()=>crypto.randomBytes(24).toString('base64url');
const env={DB:d1(),PEPPER:rnd()+rnd(),SETUP_TOKEN:rnd()+rnd(),SETUP_UNTIL:String(1_800_000_000_000+86400e3),PBKDF2_ITER:'100000'};const PW='Synthetic-'+rnd();
let t=1_800_000_000_000;
const call=async(method,p,{body,token,origin=ORIGIN,ip='198.51.100.7',now=t,xrw='consent'}={})=>{const h={'CF-Connecting-IP':ip};if(origin)h.Origin=origin;if(xrw)h['X-Requested-With']=xrw;if(body!==undefined)h['Content-Type']='application/json';if(token)h['Cookie']='__Host-lcr_sid='+token;const r=await handle(new Request('https://api.example'+p,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)}),env,now);const sc=r.headers.get('Set-Cookie')||'';const m=sc.match(/__Host-lcr_sid=([A-Za-z0-9_-]{43})/);if(sc)assert.match(sc,/; Path=\/; Secure; HttpOnly; SameSite=Strict; Max-Age=\d+$/);const j=await r.json().catch(()=>null);if(j)assert(!JSON.stringify(j).match(/[A-Za-z0-9_-]{43}/),'no token in body');return{s:r.status,h:r.headers,j,cookie:m?m[1]:null};};
// closed by default
assert.equal((await handle(new Request('https://x/api/status'),{DB:env.DB},t)).status,503,'no pepper -> closed');
let r=await call('GET','/api/status');assert.equal(r.j.configured,false);assert.equal(r.h.get('Cache-Control'),'no-store');assert.equal(r.h.get('Access-Control-Allow-Origin'),null,'no CORS');assert.equal(r.j.setupOpen,true);assert.equal(r.h.get('X-Frame-Options'),'DENY');
for(const [m,p] of [['GET','/api/reservations'],['POST','/api/login']])assert.equal((await call(m,p,{body:m==='POST'?{username:'admin',password:PW}:undefined})).s,503);
assert.equal((await call('GET','/api/status',{origin:'https://evil.example'})).s,403,'foreign origin');
// CSRF: state changes need same Origin + X-Requested-With
assert.equal((await call('POST','/api/setup',{body:{token:env.SETUP_TOKEN,username:'admin',password:PW},xrw:null})).s,403);
assert.equal((await call('POST','/api/setup',{body:{token:env.SETUP_TOKEN,username:'admin',password:PW},origin:null})).s,403);
// setup window: closed without token, without/expired/over-24h SETUP_UNTIL
for(const e of [{SETUP_TOKEN:undefined},{SETUP_UNTIL:undefined},{SETUP_UNTIL:String(t-1)},{SETUP_UNTIL:String(t+48*3600e3)},{SETUP_TOKEN:'short'}]){const saved={...env};Object.assign(env,e);const st=await call('GET','/api/status');assert.equal(st.j.setupOpen,false);assert.equal((await call('POST','/api/setup',{body:{token:saved.SETUP_TOKEN,username:'admin',password:PW}})).j.error,'setup_closed');Object.assign(env,saved);}
// setup needs token; first visitor cannot claim
assert.equal((await call('POST','/api/setup',{body:{token:'x',username:'admin',password:PW}})).s,401);
assert.equal((await call('POST','/api/setup',{body:{token:env.SETUP_TOKEN,username:'admin',password:'short'}})).s,400);
r=await call('POST','/api/setup',{body:{token:env.SETUP_TOKEN,username:'admin',password:PW}});assert.equal(r.s,201);assert(r.cookie);assert.equal((await call('GET','/api/status')).j.setupOpen,false);
assert.equal((await call('POST','/api/setup',{body:{token:env.SETUP_TOKEN,username:'admin',password:PW}})).s,410,'setup one-time');
const adminRow=env.DB.raw.prepare('SELECT * FROM admin').get();assert(!JSON.stringify(adminRow).includes(PW));assert.equal(adminRow.hash.length,64);assert.equal(adminRow.iter,100000);
// auth required everywhere
for(const [m,p] of [['GET','/api/reservations'],['POST','/api/reservations'],['GET','/api/reservations/00000000-0000-4000-8000-000000000000'],['POST','/api/logout']])assert.equal((await call(m,p,{body:m==='POST'?{}:undefined})).s,401,m+p);
assert.equal((await call('GET','/api/reservations',{token:'A'.repeat(43)})).s,401);
assert.equal((await call('GET','/api/reservations',{origin:'https://evil.example'})).s,403);
// wrong password + throttling
for(let i=0;i<5;i++)assert.equal((await call('POST','/api/login',{body:{username:'admin',password:'wrong-'+i}})).s,401);
assert.equal((await call('POST','/api/login',{body:{username:'admin',password:PW}})).s,429,'locked after 5 fails');
assert.equal((await call('POST','/api/login',{body:{username:'admin',password:PW},ip:'198.51.100.8'})).s,200,'other device ok');
// two independent sessions (PC + tablet)
const pc=(await call('POST','/api/login',{body:{username:'admin',password:PW},ip:'203.0.113.10'})).cookie;
const tab=(await call('POST','/api/login',{body:{username:'admin',password:PW},ip:'203.0.113.11'})).cookie;
assert.equal((await call('PUT','/api/reservations/00000000-0000-4000-8000-000000000000',{token:pc,body:{},xrw:null})).s,403,'csrf on authed write');
// CPU: one 100k PBKDF2 login in Node (reported, not a Workers measurement)
{const a=process.cpuUsage();await call('POST','/api/login',{body:{username:'admin',password:PW},ip:'203.0.113.12'});const u=process.cpuUsage(a);console.log('node login cpu ms ~',Math.round((u.user+u.system)/1000));}
assert.notEqual(pc,tab);
const rec={no:'TEST-RES-0001',name:'TEST USER',phone:'+1 555 0100',email:'test.user@example.invalid'};
r=await call('POST','/api/reservations',{token:pc,body:rec});assert.equal(r.s,201);const id=r.j.id;
r=await call('GET','/api/reservations',{token:tab});assert.equal(r.s,200);assert.equal(r.j.items.length,1);assert.equal(r.j.items[0].label,'TE••••••••001 · T•••••••R');assert(!JSON.stringify(r.j).includes('555')&&!JSON.stringify(r.j).includes('example.invalid'),'list masked');
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
// storage contains only allowed columns
assert.deepEqual(env.DB.raw.prepare('PRAGMA table_info(reservations)').all().map(c=>c.name),['id','res_no','name','phone','email','version','created_at','updated_at']);
const src=fs.readFileSync(path.join(root,'worker/index.mjs'),'utf8');assert(!/console\./.test(src),'no logging');assert(!/Access-Control-Allow/.test(src),'no CORS');
console.log('PASS: closed-by-default, one-time token setup, auth on all routes, throttle, 2 independent sessions share data, masked list, schema allowlist/card rejection, SQL params, stale-edit 409, pagination, idle expiry/logout, no logs, cookie HttpOnly/Strict, CSRF, setup window');
})().catch(e=>{console.error(e.message);process.exit(1);});
