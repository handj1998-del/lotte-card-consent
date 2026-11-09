'use strict';
// t90: PC review sharing starts automatically when a customer form opens on a tablet signed in to the shared account; 10 min per customer.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
let JSDOM;try{({JSDOM}=require('jsdom'));}catch{try{({JSDOM}=require('/tmp/rvqa/node_modules/jsdom'));}catch{console.log('SKIP: jsdom not installed');process.exit(0);}}
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
(async()=>{
const html=read('index.html').replace(/<script[^>]*><\/script>/g,'');
const dom=new JSDOM(html,{url:'https://w.example/',runScripts:'dangerously',pretendToBeVisual:true});const w=dom.window,d=w.document;
let hidden=false;Object.defineProperty(d,'hidden',{get:()=>hidden});Object.defineProperty(d,'visibilityState',{get:()=>hidden?'hidden':'visible'});
w.HTMLCanvasElement.prototype.getContext=function(){return new Proxy({},{get:(t,k)=>k==='canvas'?this:typeof k==='string'&&/^(measureText)$/.test(k)?()=>({width:1}):()=>{} ,set:()=>true});};
const calls=[];w.fetch=async(u,o={})=>{const p=String(u).replace(/^https:\/\/w\.example\//,'');calls.push((o.method||'GET')+' '+p);const body=p.startsWith('api/status')?{configured:true,setupOpen:false}:p.startsWith('api/session')?{ok:true,username:'synthetic'}:p.startsWith('api/reservations')?{items:[],next:null}:p.startsWith('api/logout')?{ok:true}:null;
  return{ok:!!body,status:body?200:404,headers:{get:()=>'application/json'},json:async()=>body};};
w.scrollTo=()=>{};w.confirm=()=>true;w.alert=()=>{};w.HTMLDialogElement&&(w.HTMLDialogElement.prototype.showModal=function(){this.open=true;},w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));});
w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;try{Object.defineProperty(w,'crypto',{value:globalThis.crypto});}catch{}
const sockets=[];w.WebSocket=class{constructor(u){this.url=String(u);this.readyState=1;this.sent=[];this.closed=null;sockets.push(this);}send(m){this.sent.push(m);}close(c){this.closed=c||1000;this.readyState=3;}};
{const s=d.createElement('script');s.textContent=['i18n.js','consent.js','reservations.js','server-reservations.js','guide.js','review.js'].map(read).join('\n;\n');d.body.append(s);}
const $=id=>d.getElementById(id);const tick=()=>new Promise(r=>setTimeout(r,30));
await tick();await tick();

const wait=ms=>new Promise(r=>setTimeout(r,ms));const pubs=()=>sockets.filter(s=>/role=pub/.test(s.url)),open=()=>pubs().filter(s=>!s.closed),ttl=s=>+new URL(s.url).searchParams.get('ttl');
const st=()=>$('reviewShareStatus').textContent;const realNow=Date.now;let skew=0;w.Date.now=()=>realNow()+skew;
assert.equal($('srvAdmin').hidden,false,'signed in');assert.equal(pubs().length,0,'no share before a customer form opens');
// 예약 없이 작성 -> auto share, 10 min
$('srvNoBooking').click();await tick();await tick();
assert.equal(open().length,1,'auto-started without a tap');assert(ttl(open()[0])>590e3&&ttl(open()[0])<=600e3,'10-min ttl requested');
await wait(450);assert(/10/.test(st())&&st().includes(w.eval("t('rvSharing',{n:0,m:10})").split('·')[0].trim()),'status shows sharing with 10 min');
const first=open()[0];
// back to 예약 화면 and resume: same share continues (no new connection, no timer reset)
$('resBack').click();await tick();await tick();$('resResume').hidden=false;$('resResume').click();await tick();await tick();
assert.equal(pubs().length,1,'resume keeps the running share');assert.equal(first.closed,null);
// connection lost, then resume: reconnect only for the remaining time of this customer
skew=4*60e3;first.closed=1006;first.onclose({code:1006});await tick();$('resBack').click();await tick();await tick();$('resResume').hidden=false;$('resResume').click();await tick();await tick();
assert.equal(open().length,1);const re=open()[0];assert.notEqual(re,first);assert(ttl(re)<=6*60e3+1000&&ttl(re)>5*60e3,'remaining ~6 min, not extended');
// expiry on the client: stops, says 10 min ended, resume does NOT restart; manual button starts a fresh 10 min
skew=10*60e3+1000;await wait(450);assert.equal(open().length,0,'stopped at 10 min');assert(re.closed);assert.equal(st(),w.eval("t('rvExpired')"));assert(/10/.test(st()));
$('resBack').click();await tick();await tick();$('resResume').hidden=false;$('resResume').click();await tick();await tick();assert.equal(open().length,0,'expired: no silent restart');
$('reviewShareBtn').click();await tick();await tick();assert.equal(open().length,1,'manual restart');assert(ttl(open()[0])>590e3);
// new customer: old share stopped, fresh 10 min
const before=open()[0];w.confirm=()=>true;w.eval("fields.find(x=>x.label==='임차인 이름').el").value='TEST CUSTOMER';
$('resBack').click();await tick();await tick();$('srvNoBooking').click();await tick();await tick();
assert(before.closed,'old share closed');assert.equal(open().length,1);assert.notEqual(open()[0],before);assert(ttl(open()[0])>590e3,'fresh 10 min for the new customer');
// 동의완료 stops and resume does not restart for that customer
w.consentReviewStop('rvDone');assert.equal(open().length,0);assert.equal(st(),w.eval("t('rvDone')"));
$('resBack').click();await tick();await tick();$('resResume').hidden=false;$('resResume').click();await tick();await tick();assert.equal(open().length,0,'done: no restart');
assert((read('consent.js').match(/window\.consentReviewStop\('rvDone'\)/g)||[]).length===2,'PDF and JPG saves stop sharing');
// not signed in (local PIN mode / expired session): silent, no share
const of=w.fetch;w.fetch=async(u,o)=>String(u).includes('api/session')?{ok:false,status:401,headers:{get:()=>'application/json'},json:async()=>({})}:of(u,o);
w.eval("window.consentReviewAuto('new')");await tick();await tick();assert.equal(open().length,0,'no share without server sign-in');assert.notEqual(st(),w.eval("t('rvNeedLogin')"),'auto mode stays quiet');
w.fetch=of;w.eval("window.consentReviewAuto('new')");await tick();await tick();assert.equal(open().length,1);
// logout stops
$('resBack').click();await tick();await tick();$('srvLogout').click();await tick();assert.equal(open().length,0,'logout stops sharing');
for(const l of ['ko','en','zh-CN','zh-TW','ja']){const d=w.eval('translations')[l];assert(/10/.test(d.rvSharing)&&/\{m\}/.test(d.rvSharing)&&/10/.test(d.rvExpired)&&d.rvDone,l);assert(!/30/.test(d.rvSharing+d.rvExpired),l+' no 30 min');}
console.log('PASS: auto share on customer form (no tap), 10-min ttl, resume continues/remaining only, client expiry no silent restart, manual restart, new customer fresh 10 min, 동의완료/logout stop, silent without sign-in, 5 languages');process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
