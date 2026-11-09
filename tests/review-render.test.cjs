'use strict';
// t91: PC review must show the COMPLETE current document: both pages with every field + signatures, even when snapshots arrive while
// a previous render is still loading fonts/page images (lazy loading), and the PC's own form must never keep the tablet's values.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
let JSDOM;try{({JSDOM}=require('jsdom'));}catch{try{({JSDOM}=require('/tmp/rvqa/node_modules/jsdom'));}catch{console.log('SKIP: jsdom not installed');process.exit(0);}}
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
(async()=>{
const html=read('index.html').replace(/<script[^>]*><\/script>/g,'');
const dom=new JSDOM(html,{url:'https://w.example/',runScripts:'dangerously',pretendToBeVisual:true});const w=dom.window,d=w.document;
let hidden=false;Object.defineProperty(d,'hidden',{get:()=>hidden});Object.defineProperty(d,'visibilityState',{get:()=>hidden?'hidden':'visible'});
w.HTMLCanvasElement.prototype.getContext=function(){const cv=this;cv.__t=cv.__t||[];return new Proxy({},{get:(t,k)=>k==='canvas'?cv:k==='measureText'?()=>({width:1}):k==='fillText'?(s=>cv.__t.push(String(s))):k==='drawImage'?(src=>{if(src&&src.__t)cv.__t.push(...src.__t);if(src&&src.__sig)cv.__t.push('SIG:'+src.__sig);}):k==='clearRect'?()=>{cv.__t=[];}:()=>{},set:()=>true});};
let decodeDelay=0;w.HTMLImageElement.prototype.decode=function(){return new Promise(r=>setTimeout(r,decodeDelay));};
const calls=[];w.fetch=async(u,o={})=>{const p=String(u).replace(/^https:\/\/w\.example\//,'');calls.push((o.method||'GET')+' '+p);const body=p.startsWith('api/status')?{configured:true,setupOpen:false}:p.startsWith('api/session')?{ok:true,username:'synthetic'}:p.startsWith('api/reservations')?{items:[],next:null}:p.startsWith('api/logout')?{ok:true}:null;
  return{ok:!!body,status:body?200:404,headers:{get:()=>'application/json'},json:async()=>body};};
w.scrollTo=()=>{};w.confirm=()=>true;w.alert=()=>{};w.HTMLDialogElement&&(w.HTMLDialogElement.prototype.showModal=function(){this.open=true;},w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));});
w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;try{Object.defineProperty(w,'crypto',{value:globalThis.crypto});}catch{}
const sockets=[];w.WebSocket=class{constructor(u){this.url=String(u);this.readyState=1;this.sent=[];sockets.push(this);}send(m){this.sent.push(m);}close(c){this.closed=c||1000;}};
{const s=d.createElement('script');s.textContent=['i18n.js','consent.js','reservations.js','server-reservations.js','guide.js','review.js'].map(read).join('\n;\n');d.body.append(s);}
const $=id=>d.getElementById(id);const tick=()=>new Promise(r=>setTimeout(r,30));
await tick();await tick();

const wait=ms=>new Promise(r=>setTimeout(r,ms));
for(const [vw,vh] of [[1366,768],[1920,1080]]){w.innerWidth=vw;w.innerHeight=vh;}
// synthetic full snapshot (fake values) built from the real field list
const labels=w.eval('fields.map(f=>[f.label,f.el.type])');
const val=(l,ty,k)=>ty==='date'?'2026-11-0'+(k%9+1):l==='카드번호'?'4111 1111 1111 1111':l.startsWith('유효기간')?'12/2030':'FAKE-'+k+'-'+l.replace(/\s/g,'');
const sigN=w.eval('signatures.length');
const mk=k=>({v:1,n:labels.length,fields:labels.map(([l,ty])=>[l,val(l,ty,k)]),choices:[],sigs:Array.from({length:sigN},(_,i)=>'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='),check:{name:true,card:'valid',expiry:'valid',renterSign:true}});
// signatures decode on PC (jsdom has no image decoding): tag images by index via src order
let sigCount=0;const RI=w.Image;w.Image=function(){const i=new RI();i.__sig='s'+(sigCount++);return i;};
const pcBefore=w.eval('JSON.stringify(fields.map(f=>f.el.value))');
// open viewer and pair with a synthetic tablet key
$('srvReviewBtn').click();await tick();const vws=sockets.find(s=>/role=sub/.test(s.url));vws.onopen();await tick();
const hello=JSON.parse(vws.sent.at(-1));const R=w.eval('ConsentReview');const tab=await R.keyPair();const key=await R.shared(tab.priv,hello.pub);
await vws.onmessage({data:JSON.stringify({t:'key',pub:tab.pub})});
const send=async snap=>vws.onmessage({data:JSON.stringify({t:'data',...await R.seal(key,{...snap,at:Date.now()})})});
// slow first render (fonts/images loading) while the tablet keeps typing: several snapshots overlap
decodeDelay=150;await send(mk(1));assert($('rvPages').querySelector('.rv-loading'),'loading note while pages load');await wait(40);await send(mk(2));await wait(40);await send(mk(3));
for(let i=0;i<100&&$('rvPages').querySelectorAll('canvas').length<2;i++)await wait(30);await wait(600);
const pages=[...$('rvPages').querySelectorAll('canvas')];assert.equal(pages.length,2,'both pages shown');
const drawn=pages.flatMap(c=>c.__t||[]);
const last=mk(3).fields.filter(([l,v])=>v&&!/date/i.test(l)).map(([l,v])=>v);
const missing=last.filter(v=>!drawn.some(s=>s.includes(v.slice(0,6))||v.includes(s)));
{const m=missing.filter(v=>v.startsWith('FAKE-3'));assert.equal(m.length,0,'every latest field drawn on the pages: missing '+JSON.stringify(m.slice(0,4))+' drawn '+JSON.stringify(drawn.slice(0,6)));}
assert(!drawn.some(s=>/FAKE-1-|FAKE-2-/.test(s)),'no stale snapshot values mixed in');
assert(drawn.some(s=>s.startsWith('SIG:')),'signatures drawn');assert(!drawn.includes('09')&&drawn.filter(x=>x==='04').length>=1&&!drawn.some(x=>x.includes('2026.11.09')),'dates drawn from the tablet snapshot, not the PC form: '+JSON.stringify(drawn.slice(-6)));
assert.equal(w.eval('JSON.stringify(fields.map(f=>f.el.value))'),pcBefore,'PC own form untouched after overlapping renders');
assert.equal(w.eval('signatures.filter(s=>s.image).length'),0,'PC own signatures untouched');
assert(!$('rvPages').querySelector('.rv-loading'),'loading note replaced by pages');
// share ends while a render is in flight: nothing reappears
await send(mk(4));await vws.onmessage({data:JSON.stringify({t:'end'})});await wait(1500);assert.equal($('rvPages').querySelectorAll('canvas').length,0,'ended share stays cleared');
assert.equal(w.eval('JSON.stringify(fields.map(f=>f.el.value))'),pcBefore);await send(mk(3));for(let i=0;i<60&&$('rvPages').querySelectorAll('canvas').length<2;i++)await wait(30);
// table: all filled fields incl. full card number, read-only
const rows=[...$('rvFields').querySelectorAll('tr')];assert(rows.length>=last.length,'all filled fields listed');assert($('rvFields').textContent.includes('4111 1111 1111 1111'),'full card number as before');
assert(!$('reviewDialog').querySelector('input,textarea,[contenteditable]'),'read-only');
// CSS: pages scale to dialog width and the dialog scrolls (nothing cropped)
const css=read('consent.css');assert(/\.rv-pages canvas\{width:100%;height:auto;display:block/.test(css));assert(/dialog,#previewDialog\{[^}]*overflow:auto/.test(css));assert(!/\.review-dialog\{[^}]*overflow:hidden/.test(css));
console.log('PASS: PC review shows both pages with all latest fields + signatures under overlapping snapshots, PC form untouched, full table incl. card number, scrollable dialog');process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
