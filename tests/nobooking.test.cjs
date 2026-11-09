'use strict';
// t89: green 예약 없이 작성 next to the reservation actions on the shared-server list (and local admin list); same startCustomer(null) flow.
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

const visible=el=>{for(let n=el;n&&n!==d.body;n=n.parentElement)if(n.hidden)return false;return true;};
// static: three buttons, unique ids, same label key, green class + CSS, 5 languages
const html0=read('index.html'),css=read('consent.css');
for(const id of ['resNoBooking','srvNoBooking','resNoBookingAdmin']){assert.equal((html0.match(new RegExp(`id="${id}"`,'g'))||[]).length,1,id);const b=$(id);assert(b.classList.contains('res-nobooking'),id+' green');assert.equal(b.dataset.i18n,'resNoBooking');}
assert(/\.res-nobooking\{background:#17713a!important;[^}]*color:#fff!important;[^}]*min-height:58px/.test(css),'green, white text, 58px');
const dict=w.eval('translations');for(const l of ['ko','en','zh-CN','zh-TW','ja'])assert(dict[l].resNoBooking,l);
assert($('srvAdd').nextElementSibling===$('srvNoBooking'),'next to 예약 추가');assert($('resAdd').nextElementSibling===$('resNoBookingAdmin'));
// signed-in shared list shows it
assert.equal(visible($('srvAdmin')),true,'restored signed-in admin');assert.equal(visible($('srvNoBooking')),true,'visible on shared reservation screen');
let stops=0;w.consentReviewStop=()=>{stops++;};
const nameF=w.eval("fields.find(x=>x.label==='임차인 이름').el"),noF=w.eval("fields.find(x=>x.label==='예약번호').el");
// empty form: no prompt, opens blank form without reservation
let asked=0;w.confirm=()=>{asked++;return true;};
$('srvNoBooking').click();await tick();
assert(d.body.classList.contains('view-guide'),'goes to the customer flow');assert.equal(asked,0,'no prompt when nothing typed');assert.equal(noF.value,'');assert.equal(nameF.value,'');assert.equal($('srvList').children.length,0);assert.equal(stops,1,'PC review stopped as on select');
// with a draft: back to 예약 화면 (session restore), cancel keeps the draft
nameF.value='TEST CUSTOMER';$('resBack').click();await tick();await tick();
assert(d.body.classList.contains('view-reserve'));assert.equal(visible($('srvNoBooking')),true,'still there after returning');
w.confirm=()=>{asked++;return false;};$('srvNoBooking').click();await tick();
assert.equal(asked,1,'draft prompt');assert.equal(nameF.value,'TEST CUSTOMER','cancel keeps the draft');assert(d.body.classList.contains('view-reserve'),'stays on reservation screen');
w.confirm=()=>{asked++;return true;};$('srvNoBooking').click();await tick();
assert.equal(asked,2);assert.equal(nameF.value,'','confirm clears for a new customer');assert(d.body.classList.contains('view-guide'));
// landing button keeps working and is green too
$('resBack').click();await tick();nameF.value='';$('resNoBooking').click();await tick();assert(d.body.classList.contains('view-guide'));
console.log('PASS: green 예약 없이 작성 on shared list (next to 예약 추가), local admin list and landing; blank form, draft prompt (cancel keeps), PC review stop, 5 languages');process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
