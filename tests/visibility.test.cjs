'use strict';
// Bug t80: switching to another browser tab and back reset the shared-server admin screen (add form) to the landing screen.
// Loads the real index.html + app scripts in jsdom and dispatches real visibilitychange / pagehide / pageshow / blur events.
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
w.WebSocket=class{constructor(){this.readyState=0;}send(){}close(){}};
{const s=d.createElement('script');s.textContent=['i18n.js','consent.js','reservations.js','server-reservations.js','guide.js','review.js'].map(read).join('\n;\n');d.body.append(s);}
const $=id=>d.getElementById(id);const tick=()=>new Promise(r=>setTimeout(r,30));
await tick();await tick();
// page load with a valid persistent session -> server admin screen restored
assert.equal($('srvOpenBtn').hidden,false);assert.equal($('srvAdmin').hidden,false,'restored signed-in admin');
// open 예약 추가 and type a partial draft
$('srvAdd').click();const f=$('srvForm');assert.equal(f.hidden,false);
f.elements.no.value='TEST-RES-0042';f.elements.name.value='TEST USER';f.elements.phone.value='+1 555 0100';
// main customer form draft too
const fld=l=>[...d.querySelectorAll('input')].find(i=>i.getAttribute('aria-label')===l||i.dataset.label===l);
const name=w.eval("fields.find(x=>x.label==='임차인 이름').el");name.value='TEST CUSTOMER';w.eval("signatures[0].image={src:'data:image/png;base64,AAAA'}");
const state=()=>JSON.stringify({admin:$('srvAdmin').hidden,form:f.hidden,locked:$('resLocked').hidden,no:f.elements.no.value,nm:f.elements.name.value,ph:f.elements.phone.value,cust:name.value,sig:!!w.eval('signatures[0].image'),view:d.body.className});
const before=state();const n=calls.length;
// switch tab away and back, minimize, page hide/show, blur/focus
hidden=true;d.dispatchEvent(new w.Event('visibilitychange'));w.dispatchEvent(new w.Event('blur'));await tick();
w.dispatchEvent(new w.Event('pagehide'));await tick();
hidden=false;d.dispatchEvent(new w.Event('visibilitychange'));w.dispatchEvent(new w.Event('pageshow'));w.dispatchEvent(new w.Event('focus'));await tick();
assert.equal(state(),before,'tab switch must not hide/reset the server admin add form or the customer draft');
assert(!calls.slice(n).some(c=>c.startsWith('POST api/logout')),'no logout on tab switch');
// local PIN vault (GitHub Pages mode) still locks itself on hide, without touching the server UI or customer draft
$('srvAdmin').hidden=true;$('resUnlock').hidden=false;$('resPin').value='1357';const srvNo=f.elements.no.value;
hidden=true;d.dispatchEvent(new w.Event('visibilitychange'));await tick();hidden=false;
assert.equal($('resUnlock').hidden,true,'local unlock screen locked');assert.equal($('resPin').value,'','local PIN input wiped');assert.equal($('resLocked').hidden,false);
assert.equal(f.elements.no.value,srvNo,'server draft untouched by local lock');assert.equal(name.value,'TEST CUSTOMER');
$('resLocked').hidden=true;$('srvAdmin').hidden=false;
// deliberate logout still works and clears
$('srvLogout').click();await tick();assert.equal($('srvAdmin').hidden,true);assert(calls.some(c=>c==='POST api/logout'));assert.equal(f.elements.no.value,'');
console.log('PASS: real visibilitychange/pagehide/pageshow/blur keep server admin add-form draft, view, login and customer draft; logout still clears');
})().catch(e=>{console.error(e);process.exit(1);});
