'use strict';
// PC live review: E2E crypto, relay routing/limits (fake DO runtime), Worker gate, static UI rules. Synthetic data only.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const {ConsentReview:R}=require(path.join(root,'review.js'));
(async()=>{
// --- crypto: ECDH P-256 -> AES-GCM-256, fresh IV, tamper/wrong key fail
const a=await R.keyPair(),b=await R.keyPair(),c=await R.keyPair();
assert.deepEqual(Object.keys(a.pub).sort(),['crv','ext','key_ops','kty','x','y'].filter(k=>k in a.pub).sort());assert(!('d' in a.pub),'private key never exported');
const ka=await R.shared(a.priv,b.pub),kb=await R.shared(b.priv,a.pub),kc=await R.shared(c.priv,a.pub);
const snap={v:1,fields:[['카드번호','4111 1111 1111 1111'],['임차인 이름','TEST USER']],sigs:[null]};
const m1=await R.seal(ka,snap),m2=await R.seal(ka,snap);assert.notEqual(m1.iv,m2.iv);assert(!m1.ct.includes('4111')&&!JSON.stringify(m1).includes('TEST'));
assert.deepEqual(await R.open(kb,m1),snap);await assert.rejects(R.open(kc,m1));
const bad={...m1,ct:m1.ct.slice(0,-4)+(m1.ct.slice(-4)==='AAAA'?'BBBB':'AAAA')};await assert.rejects(R.open(kb,bad));
assert.throws(()=>R.cleanJwk({kty:'EC',crv:'P-384',x:'a',y:'b'}));assert.throws(()=>R.cleanJwk({kty:'RSA'}));
// --- fake Durable Object runtime
class FakeWS{constructor(){this.out=[];this.closed=null;this.att=null;this.tags=[];}send(s){if(this.closed)throw Error('closed');this.out.push(JSON.parse(s));}close(code,r){this.closed=code||1000;}serializeAttachment(v){this.att=JSON.parse(JSON.stringify(v));}deserializeAttachment(){return this.att&&JSON.parse(JSON.stringify(this.att));}
  last(){return this.out[this.out.length-1];}types(){return this.out.map(m=>m.t);}}
const all=[];const ctx={acceptWebSocket(ws,tags){ws.tags=tags;all.push(ws);},getWebSockets(tag){return all.filter(w=>!w.closed&&(!tag||w.tags.includes(tag)));}};
let alarmAt=null;const alarmOnly={async setAlarm(t){alarmAt=t;},async deleteAlarm(){alarmAt=null;},async getAlarm(){return alarmAt;}};
Object.defineProperty(ctx,'storage',{get(){return new Proxy(alarmOnly,{get(o,k){if(!(k in o))throw Error('relay must not use storage except the alarm timestamp');return o[k];}});}});
let sessionsAlive=new Set(['S1','S2']);
const env={DB:{prepare(){let a;const st={bind(x){a=x;return st;},async first(){return sessionsAlive.has(a)?{expires_at:Date.now()+1e9}:null;}};return st;}}};
const RealResponse=globalThis.Response;let pairServer;
globalThis.WebSocketPair=function(){const cl=new FakeWS(),sv=new FakeWS();pairServer=sv;return{0:cl,1:sv};};
globalThis.Response=class{constructor(body,init={}){this.status=init.status||200;this.webSocket=init.webSocket;}};
const {Relay,handle}=await import(path.join(root,'worker/index.mjs'));
const relay=new Relay(ctx,env);let T=1_900_000_000_000;
async function connect(role,sess='S1'){const r=await relay.fetch({url:'https://relay/connect?role='+role,headers:new Map([['X-Session',sess],['X-Now',String(T)]])});if(r.status!==101)return{status:r.status};return{status:101,ws:pairServer};}
const msg=(ws,o,now=T)=>relay.webSocketMessage(ws,typeof o==='string'?o:JSON.stringify(o),now);
const v1=(await connect('sub')).ws;assert.equal(v1.last().t,'joined');assert.equal(v1.last().pub,false);
const p1=(await connect('pub')).ws;assert.equal(v1.last().t,'pubup','viewer told publisher is up');
await msg(v1,{t:'hello',pub:b.pub});const h=p1.last();assert.equal(h.t,'hello');assert.equal(typeof h.from,'string');assert.equal(h.from,v1.att.id);
await msg(p1,{t:'key',to:h.from,pub:a.pub});assert.deepEqual(v1.last(),{t:'key',pub:a.pub});
await msg(p1,{t:'data',to:h.from,...m1,extra:'x'});assert.deepEqual(v1.last(),{t:'data',iv:m1.iv,ct:m1.ct},'only iv/ct forwarded');
const v2=(await connect('sub','S2')).ws;assert.equal(p1.last().t,'sub');
await msg(p1,{t:'data',to:h.from,...m2});assert.notEqual(v2.last().t,'data','data goes only to the addressed viewer');
const n=p1.out.length;await msg(v1,{t:'data',to:v2.att.id,...m1});await msg(v1,{t:'key',to:v2.att.id,pub:c.pub});assert.equal(v2.last().t,'joined');assert.equal(p1.out.length,n,'viewer cannot publish');
// collision: newer tablet replaces older; old publisher can no longer send
const p2=(await connect('pub')).ws;assert.equal(p1.closed,4001);assert.equal(v1.last().t,'pubup');
await msg(p1,{t:'data',to:h.from,...m1});assert.equal(v1.last().t,'pubup','replaced publisher muted');
await msg(v1,{t:'hello',pub:b.pub});assert.equal(p2.last().t,'hello');
// limits
const v3=(await connect('sub')).ws;assert.equal((await connect('sub')).status,429,'max 3 viewers');
await msg(v1,'x'.repeat(900001));assert.equal(v1.closed,1009);
await msg(v3,{t:'hello',pub:b.pub},T+2*3600e3+1);assert.equal(v3.closed,4002,'viewer window 2h');
sessionsAlive.delete('S2');await msg(v2,{t:'hello',pub:b.pub},T+31e3);assert.equal(v2.closed,4003,'signed-out session dropped');
// end + gone
const v4=(await connect('sub')).ws;await msg(p2,{t:'end'});assert.equal(v4.last().t,'end');assert.equal(p2.closed,1000);
const p3=(await connect('pub')).ws;await relay.webSocketClose(p3);p3.closed=1000;assert.equal(v4.last().t,'gone');
const p4=(await connect('pub')).ws;await msg(p4,{t:'data',to:v4.att.id,...m1},T+10*60e3+1);assert.equal(p4.closed,4002,'tablet share 10 min (message path)');
// idle expiry: DO alarm closes the tablet share at 10 min with no traffic and tells viewers; requested ttl can only shorten
async function connectTtl(ttl){const r=await relay.fetch({url:'https://relay/connect?role=pub&ttl='+ttl,headers:new Map([['X-Session','S1'],['X-Now',String(T)]])});return pairServer;}
const p5=await connectTtl(99*60e3);assert.equal(p5.att.exp,T+10*60e3,'ttl clamped to 10 min');assert(alarmAt!==null&&alarmAt<=T+10*60e3,'alarm scheduled');
const v5=all.find(x=>!x.closed&&x.tags.includes('sub'));await relay.alarm(T+10*60e3-1);assert(!p5.closed,'not before expiry');
await relay.alarm(T+10*60e3+1);assert.equal(p5.closed,4002,'idle share closed at expiry');assert.equal(v5.last().t,'end','viewer told');
const p6=await connectTtl(3*60e3);assert.equal(p6.att.exp,T+3*60e3,'remaining-time ttl honoured');await relay.alarm(T+3*60e3+1);assert.equal(p6.closed,4002);
globalThis.Response=RealResponse;
// --- Worker gate (auth + origin + upgrade) before reaching the relay
const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(':memory:');db.exec(read('worker/schema.sql'));
const D1={prepare(sql){let args=[];const st={bind(...x){args=x;return st;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return{results:db.prepare(sql).all(...args)};},async run(){const r=db.prepare(sql).run(...args);return{meta:{changes:Number(r.changes)}};}};return st;}};
db.prepare("INSERT INTO admin VALUES (1,'synthetic','00',600000,'00',0)").run();
const tok='Q'.repeat(43);const th=require('node:crypto').createHash('sha256').update(tok).digest('hex');const now=Date.now();
db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(th,now,now,now+1e9);
let forwarded=null;const wenv={DB:D1,PEPPER:'p'.repeat(40),RELAY:{idFromName:n=>n,get:()=>({fetch:async r=>{forwarded=r;return new RealResponse('relay',{status:200});}})}};
const O='https://w.example';const rq=(q,h)=>handle(new Request(O+'/api/review'+q,{headers:h}),wenv,now);
assert.equal((await rq('?role=sub',{Origin:O,Upgrade:'websocket'})).status,401,'no session');
assert.equal((await rq('?role=sub',{Origin:'https://evil.example',Upgrade:'websocket',Cookie:'__Host-lcr_sid='+tok})).status,403,'cross-origin');
assert.equal((await rq('?role=sub',{Upgrade:'websocket',Cookie:'__Host-lcr_sid='+tok})).status,403,'no origin');
assert.equal((await rq('?role=sub',{Origin:O,Cookie:'__Host-lcr_sid='+tok})).status,426);
assert.equal((await rq('?role=admin',{Origin:O,Upgrade:'websocket',Cookie:'__Host-lcr_sid='+tok})).status,400);
assert.equal(forwarded,null);
assert.equal((await rq('?role=sub',{Origin:O,Upgrade:'websocket',Cookie:'__Host-lcr_sid='+tok})).status,200);
assert.equal(forwarded.headers.get('X-Session'),th);assert.equal(new URL(forwarded.url).searchParams.get('ttl'),'600000','worker clamps/forwards 10-min ttl');assert(!forwarded.headers.get('Cookie'),'cookie not forwarded to relay');
// --- static UI rules
const js=read('review.js'),html=read('index.html'),w=read('worker/index.mjs');
assert(!/localStorage|sessionStorage|indexedDB|console\.|sendBeacon|document\.cookie/.test(js));
{const rl=w.slice(w.indexOf('export class Relay'),w.indexOf('export async function handle'));assert(!/sql\.exec|console\.|storage\.(?!setAlarm|deleteAlarm)/.test(rl),'relay: only alarm timestamps, no data storage, no logs');}
assert(!/exportKey\('jwk',kp\.privateKey\)/.test(js)&&/generateKey\(ECDH,false,/.test(js),'non-extractable private keys');
const dlg=html.match(/<dialog id="reviewDialog"[^]*?<\/dialog>/)[0];assert(!/<input|<textarea|contenteditable|download|id="save|savePreview/.test(dlg),'viewer read-only, no download');
assert((dlg.match(/<button/g)||[]).length===1&&/id="rvClose"/.test(dlg));
assert(/<div id="reviewShareBox"[^>]*hidden>/.test(html)&&/id="srvReviewBtn"/.test(html));
assert(read('reservations.js').includes("if(window.consentReviewStop)window.consentReviewStop();"),'new customer stops sharing');
assert(read('server-reservations.js').includes("if(window.consentReviewStop)window.consentReviewStop();if(window.consentReviewClose)window.consentReviewClose();"),'logout stops/clears');
assert(/function clearView\(\)\{[^\n]*replaceChildren/.test(js)&&/m\.t==='gone'\|\|m\.t==='end'\)\{clearView\(\)/.test(js)&&/ws\.onclose=\(\)=>\{if\(view===me\)\{clearView\(\)/.test(js),'viewer clears on end/loss');
assert(/SHARE_MS=10\*60e3/.test(js)&&/push\(false\);\}\},400\)/.test(js)&&/RV_PUB_MS = 10 \* 60e3/.test(w),'10 min both sides + live updates');
const src=read('i18n.js');const st=src.indexOf('const translations=')+19;const d=JSON.parse(src.slice(st,src.indexOf(';\nlet currentLanguage',st)));
for(const l of ['ko','en','zh-CN','zh-TW','ja'])for(const k of ['rvStart','rvStop','rvSharing','srvReview','rvTitle','rvNote','rvWaiting','rvConnected','rvDisconnected','rvEnded','rvClose','rvNeedLogin','rvExpired','rvReplaced','rvBlank','rvOk','rvBad','rvEmpty','rvNameLbl','rvCardLbl','rvExpiryLbl','rvSignLbl'])assert(d[l][k],l+k);
assert(d.ko.rvStart==='PC 확인 공유 시작'&&d.ko.rvStop==='PC 확인 공유 중지'&&d.ko.srvReview==='작성 화면 확인');
console.log('PASS: review E2E crypto, relay routing/collision/limits/expiry/sign-out/no storage, worker auth+origin gate, read-only viewer, stop on new customer/logout, 5 languages');
})().catch(e=>{console.error(e);process.exit(1);});
