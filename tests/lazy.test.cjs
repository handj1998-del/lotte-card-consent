'use strict';
// First-open speed (t86): page PNGs, canvas fonts and pdf-lib load only on demand, shared + retryable; cache headers are safe.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
let JSDOM;try{({JSDOM}=require('jsdom'));}catch{try{({JSDOM}=require('/tmp/rvqa/node_modules/jsdom'));}catch{console.log('SKIP: jsdom not installed');process.exit(0);}}
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
(async()=>{
const html=read('index.html'),css=read('consent.css'),js=read('consent.js');
// static wiring
assert(!/pdf-lib/.test(html),'pdf-lib not in the initial HTML');
assert(!/<img[^>]*\ssrc="assets\/consent\/page-/.test(html),'page PNGs not requested at first open');
for(const n of [1,2])assert(html.includes(`data-src="assets/consent/page-${n}.png?v=vector-v15"`));
assert(!/font-display:block/.test(css)&&(css.match(/font-display:swap/g)||[]).length===2,'fonts swap');
const fontSrc=JSON.parse(js.match(/FONT_SRC=(\{[^}]*\})/)[1].replace(/'/g,'"').replace(/(\w+):/g,'"$1":').replace(/"assets"/g,'assets').replace(/"(https?)":/g,'$1:'));
for(const u of Object.values(fontSrc))assert(css.includes(`url('${u}')`),'CSS and loader use the same versioned font URL '+u);
assert(fs.existsSync(path.join(root,js.match(/PDF_LIB_SRC='([^?']+)/)[1])));
// Worker cache policy (proxy only; API never cached)
{const {handle}=await import(path.join(root,'worker/index.mjs'));const og=globalThis.fetch;
 globalThis.fetch=async u=>{u=String(u);const t=/\.css/.test(u)?'text/css':/\.js/.test(u)?'application/javascript':/\.png/.test(u)?'image/png':/\.pdf/.test(u)?'application/pdf':'text/html';return new Response(/missing/.test(u)?'no':'x',{status:/missing/.test(u)?404:200,headers:{'Content-Type':t}});};
 const cc=async p=>(await handle(new Request('https://w.example'+p),{})).headers.get('Cache-Control');
 assert.equal(await cc('/'),'no-cache');assert.equal(await cc('/index.html?v=1'),'no-cache');
 assert.equal(await cc('/consent.js?v=lazy-v1'),'public, max-age=31536000, immutable');assert.equal(await cc('/assets/consent/page-1.png?v=vector-v15'),'public, max-age=31536000, immutable');
 assert.equal(await cc('/consent.js'),'public, max-age=300','unversioned stays short');assert.equal(await cc('/sw.js'),'public, max-age=300');assert.equal(await cc('/assets/consent/original.pdf'),'public, max-age=300');
 assert.equal(await cc('/missing.js?v=1'),'public, max-age=300','errors never immutable');
 const api=await handle(new Request('https://w.example/api/status'),{});assert.equal(api.headers.get('Cache-Control'),'no-store');globalThis.fetch=og;}
// app in jsdom
let decodeFail=0,decodes=0;const app=()=>{const dom=new JSDOM(html.replace(/<script[^>]*><\/script>/g,''),{url:'https://w.example/',runScripts:'dangerously',pretendToBeVisual:true});const w=dom.window,d=w.document;
w.HTMLCanvasElement.prototype.getContext=function(){return new Proxy({},{get:(t,k)=>k==='canvas'?this:k==='measureText'?()=>({width:1}):()=>{},set:()=>true});};
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==','base64');
w.HTMLCanvasElement.prototype.toBlob=function(cb){cb(new Blob([PNG],{type:'image/png'}));};
w.HTMLImageElement.prototype.decode=function(){decodes++;if(!this.getAttribute('src'))return Promise.reject(Error('nosrc'));return decodeFail>0?(decodeFail--,Promise.reject(Error('net'))):Promise.resolve();};
const orig=fs.readFileSync(path.join(root,'assets/consent/original.pdf'));
w.fetch=async u=>{const p=String(u).replace('https://w.example/','');if(p.startsWith('assets/consent/original.pdf'))return{ok:true,status:200,arrayBuffer:async()=>{const ab=new w.ArrayBuffer(orig.length);new w.Uint8Array(ab).set(orig);return ab;}};return{ok:false,status:404,headers:{get:()=>''},json:async()=>null};};
w.Blob=Blob;w.scrollTo=()=>{};w.alert=()=>{};w.confirm=()=>true;w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.WebSocket=class{send(){}close(){}};
w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
{const s=d.createElement('script');s.textContent=['i18n.js','consent.js','reservations.js','server-reservations.js','guide.js','review.js'].map(read).join('\n;\n');d.body.append(s);}
return{w,d};};
let {w,d}=app();
const tick=(ms=20)=>new Promise(r=>setTimeout(r,ms));await tick();
const libScripts=()=>[...d.querySelectorAll('script[src]')].filter(s=>/pdf-lib/.test(s.src));
assert.equal(w.PDFLib,undefined);assert.equal(libScripts().length,0,'no pdf-lib at first open');
for(const n of [1,2])assert(!d.querySelector(`#page${n}>img`).getAttribute('src'),'no page PNG at first open');
// pdf-lib: concurrent callers share one request; failure is reported and retried with a fresh script
let a=w.eval('loadPdfLib()'),b=w.eval('loadPdfLib()');await tick();assert.equal(libScripts().length,1,'deduped');libScripts()[0].onerror();
await assert.rejects(a);await assert.rejects(b);assert.equal(libScripts().length,0,'failed script removed');
a=w.eval('loadPdfLib()');await tick();assert.equal(libScripts().length,1,'retry makes a new request');w.PDFLib=require(path.join(root,'vendor/pdf-lib.min.js'));libScripts()[0].onload();assert.equal(await a,w.PDFLib);

// page image: failure clears src so the next attempt refetches; details toggle loads both
decodeFail=1;await assert.rejects(w.eval('pageImage(1)'));assert(!d.querySelector('#page1>img').getAttribute('src'));
assert.equal(await w.eval('pageImage(1)'),d.querySelector('#page1>img'));assert.equal(d.querySelector('#page1>img').getAttribute('src'),'assets/consent/page-1.png?v=vector-v15');
const det=d.querySelector('.source-pages').closest('details');det.open=true;det.dispatchEvent(new w.Event('toggle'));await tick();assert(d.querySelector('#page2>img').getAttribute('src'));
({w,d}=app());await tick();
// save: pdf-lib failure -> error status, inputs kept, buttons re-enabled; double tap = one request; retry saves the 2-page PDF
w.eval("validate=()=>true;window.__saved=[];saveBlob=(b,n)=>window.__saved.push({n,type:b.type,size:b.size});");
const nameEl=w.eval("fields.find(x=>x.label==='임차인 이름').el");nameEl.value='TEST CUSTOMER';
const save=d.getElementById('save'),pdfBtn=()=>{save.click();d.getElementById('savePdf').click();};pdfBtn();pdfBtn();await tick();assert.equal(libScripts().length,1,'double tap: one pdf-lib request');libScripts()[0].onerror();await tick(50);
assert.equal(w.eval('docBusy'),false);assert.equal(save.disabled,false);assert.equal(nameEl.value,'TEST CUSTOMER');assert.equal(w.eval('__saved.length'),0);
assert(d.getElementById('status').textContent.includes(w.eval("t('pdfError')")),'failure message shown');
pdfBtn();await tick();w.eval(read('vendor/pdf-lib.min.js'));libScripts().at(-1).onload();for(let i=0;i<100&&!w.eval('__saved.length');i++)await tick(30);
const sv=w.eval('__saved[0]');assert(sv&&/^consent-\d{4}-\d{2}-\d{2}\.pdf$/.test(sv.n)&&sv.type==='application/pdf','retry saves PDF');
// 문서 보기: direct PDF download (pdf-lib already loaded -> no new request), no popup
const n0=libScripts().length,k0=w.eval('__saved.length');d.getElementById('preview').click();for(let i=0;i<100&&w.eval('__saved.length')===k0;i++)await tick(30);
assert.equal(d.getElementById('previewDialog').open,false,'no popup');assert(/\.pdf$/.test(w.eval('__saved.at(-1).n')));assert.equal(libScripts().length,n0);
console.log('PASS: first open loads no pdf-lib/page PNGs, fonts swap with versioned URLs, shared+retryable loaders, save failure/retry/double-tap, preview, cache headers');
})().catch(e=>{console.error(e);process.exit(1);});
