'use strict';
// t87: 동의완료 -> choose PDF (unchanged) or JPG (one low-quality image <= 300,000 bytes). jsdom flow + optional real-encoder size check.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
let JSDOM;try{({JSDOM}=require('jsdom'));}catch{try{({JSDOM}=require('/tmp/rvqa/node_modules/jsdom'));}catch{console.log('SKIP: jsdom not installed');process.exit(0);}}
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');const html=read('index.html'),js=read('consent.js');
(async()=>{
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
let {w,d}=app();w.Element.prototype.scrollIntoView=function(){};const tick=(ms=20)=>new Promise(r=>setTimeout(r,ms));await tick();
const $=id=>d.getElementById(id),status=()=>$('status').textContent;
const libScripts=()=>[...d.querySelectorAll('script[src]')].filter(s=>/pdf-lib/.test(s.src));
assert(!$('formatDialog')&&!$('savePdf')&&!$('saveJpg'),'no PDF/JPG chooser');
assert(!$('reviewDialog').querySelector('button:not(#rvClose)'),'PC review stays read-only');
w.eval("window.__saved=[];saveBlob=(b,n)=>window.__saved.push({n,type:b.type,size:b.size});");
const nameEl=w.eval("fields.find(x=>x.label==='임차인 이름').el");
// validation runs first: empty name -> no chooser
$('save').click();await tick();assert.equal(w.eval('__saved.length'),0,'invalid form: nothing saved');assert.equal(w.eval('docBusy'),false);
nameEl.value='TEST CUSTOMER';
// 문서 보기: opens the document view (both pages) AND saves the PDF on the same tap; busy label; PC sharing NOT stopped; inputs kept
{let stops=0;const os=w.consentReviewStop;w.consentReviewStop=(...x)=>{stops++;return os&&os(...x);};
 // failure first: pdf-lib unavailable -> existing error, label restored, buttons re-enabled
 $('preview').click();for(let i=0;i<50&&!$('previewDialog').open;i++)await tick();assert.equal($('previewDialog').open,true,'view opens');assert.equal(d.querySelectorAll('#previewPages canvas').length,2,'both pages');await tick();
 assert($('previewStatus').textContent.includes(w.eval("t('loading')")),'saving status inside the view');
 assert.equal($('preview').textContent,w.eval("t('savingPdf')"),'busy label');assert.equal($('preview').disabled,true);assert.equal($('save').disabled,true,'double-tap lock');
 libScripts().at(-1).onerror();await tick(50);assert(status().includes(w.eval("t('pdfError')")));assert.equal($('preview').textContent,w.eval("t('preview')"));assert.equal($('preview').disabled,false);assert($('previewStatus').textContent.includes(w.eval("t('pdfError')")),'error shown in the view');$('closePreview').click();
 // success: form-level 문서 보기 button too
 $('previewEntry').click();for(let i=0;i<50&&!$('previewDialog').open;i++)await tick();await tick();w.eval(read('vendor/pdf-lib.min.js'));libScripts().at(-1).onload();for(let i=0;i<100&&!w.eval('__saved.length');i++)await tick(30);
 const sv=w.eval('__saved[0]');assert(/^consent-\d{4}-\d{2}-\d{2}\.pdf$/.test(sv.n)&&sv.type==='application/pdf','direct PDF');
 assert.equal(stops,0,'문서 보기 does not stop PC sharing');assert.equal(nameEl.value,'TEST CUSTOMER','inputs kept');assert.equal($('previewEntry').textContent,w.eval("t('entryPreview')"));assert.equal($('previewDialog').open,true,'view stays open');assert.equal(w.eval('__saved.length'),1,'exactly one PDF per tap');
 assert(status().includes(w.eval("t('downloadReady')")));assert($('previewStatus').textContent.includes(w.eval("t('downloadReady')")),'saved status inside the view');$('closePreview').click();w.consentReviewStop=os;w.eval('__saved.length=0');}
// JPG: adaptive loop (size model ~ width*quality), first fit wins, image/jpeg <= 300000, no pdf-lib
const libBefore=libScripts().length;const tries=[];let sizeFn=(wd,q)=>Math.round(wd*2*q*280);
w.HTMLCanvasElement.prototype.toBlob=function(cb,type,q){tries.push(this.width+'@'+q);cb(type==='image/jpeg'?new Blob([new Uint8Array(sizeFn(this.width,q))],{type}):new Blob([new Uint8Array(10)],{type:'image/png'}));};
{let st=0;const os=w.consentReviewStop;w.consentReviewStop=k=>{if(k==='rvDone')st++;};$('save').click();assert.equal($('save').textContent,w.eval("t('savingJpg')"),'busy label');assert.equal($('save').disabled,true);$('save').click();$('preview').click();for(let i=0;i<100&&!w.eval('__saved.length');i++)await tick();await tick();assert.equal(st,1,'동의완료 stops sharing');w.consentReviewStop=os;assert.equal($('save').textContent,w.eval("t('save')"),'label restored');}for(let i=0;i<100&&!w.eval('__saved.length');i++)await tick();await tick();
assert.equal(w.eval('__saved.length'),1,'one file (double tap locked)');assert(!w.document.querySelector('dialog[open]'),'no chooser/confirm dialog');const sv=w.eval('__saved[0]');
assert(/^consent-\d{4}-\d{2}-\d{2}\.jpg$/.test(sv.n));assert.equal(sv.type,'image/jpeg');assert(sv.size<=300000);assert.deepEqual(tries,['1100@0.6','1100@0.5','1100@0.42']);
assert.equal(libScripts().length,libBefore,'JPG never requests pdf-lib');assert(status().includes(w.eval("t('downloadReadyJpg')")));assert.equal(w.eval('docBusy'),false);
// smaller widths when needed
tries.length=0;sizeFn=(wd,q)=>wd<=760&&q<=0.5?299000:400000;w.eval('__saved.length=0');$('save').click();for(let i=0;i<100&&!w.eval('__saved.length');i++)await tick();
assert.equal(tries.at(-1),'760@0.5');assert(tries.length>8);assert(w.eval('__saved[0].size')<=300000);
// cannot fit -> error, no download, inputs kept
tries.length=0;sizeFn=()=>300001;w.eval('__saved.length=0');$('save').click();for(let i=0;i<100&&w.eval('docBusy')!==false||i<2;i++)await tick();await tick(50);
assert.equal(w.eval('__saved.length'),0);assert(status().includes(w.eval("t('jpgTooLarge')")));assert.equal(tries.length,9*4,'every width/quality step tried');assert.equal(nameEl.value,'TEST CUSTOMER');assert.equal($('save').disabled,false);
// encoder failure -> generic error
w.HTMLCanvasElement.prototype.toBlob=function(cb){cb(null);};$('save').click();await tick(100);assert(status().includes(w.eval("t('pdfError')")));assert.equal(w.eval('__saved.length'),0);
// real encoder size check with the actual makeJPG code (optional: @napi-rs/canvas)
let napi;try{napi=require('@napi-rs/canvas');}catch{try{napi=require('/tmp/jpgm/node_modules/@napi-rs/canvas');}catch{}}
if(napi){const src=js.slice(js.indexOf('const JPG_MAX'),js.indexOf('async function savePDF'));const pages=[await napi.loadImage(path.join(root,'assets/consent/page-1.png')),await napi.loadImage(path.join(root,'assets/consent/page-2.png'))];
 const renderPage=async p=>{const c=napi.createCanvas(2482,3508),x=c.getContext('2d');x.drawImage(pages[p-1],0,0,2482,3508);x.fillStyle='#111';x.font='34px sans-serif';for(let k=0;k<14;k++)x.fillText('TEST CUSTOMER 010-0000-0000 2026.11.09',500,600+k*190);x.lineWidth=6;x.beginPath();x.moveTo(1700,3200);for(let i=0;i<20;i++)x.lineTo(1700+i*25,3200+(i%2?-40:40));x.stroke();return c;};
 const doc={createElement:()=>napi.createCanvas(1,1)};const makeJPG=new Function('document','renderPage',src+';return makeJPG;')(doc,renderPage);
 let last;const b=await makeJPG((c,q)=>{const buf=c.encodeSync('jpeg',Math.round(q*100));last={w:c.width,h:c.height,q};return{size:buf.length,type:'image/jpeg'};});
 assert(b.size<=300000);console.log(`real encoder (@napi-rs/canvas): ${last.w}x${last.h} q${last.q} -> ${b.size} bytes`);}
else console.log('NOTE: @napi-rs/canvas not installed; real-encoder size check skipped');
console.log('PASS: 동의완료 = direct JPG after validation (no chooser), 문서 보기 = direct PDF (keeps sharing), JPG one image/jpeg <=300000 adaptive width/quality, too-large/encoder errors keep inputs, double-tap lock, no pdf-lib for JPG, PC review read-only');process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
