'use strict';
// Save = download only (no viewer window/navigation); file stays .pdf/application/pdf; uses app makePDF on the real template.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');const js=read('consent.js');
const fn=name=>js.match(new RegExp(`(async )?function ${name}\\(.*?\\n`,'s'))[0];
const created=[],opened=[],timers=[];let navigated=false,revoked=[];
const doc={body:{append:a=>{a.inDom=true}},createElement:tag=>{const a={tag,style:{},clicked:0,inDom:false,click(){this.clicked++},remove(){this.inDom=false},setAttribute(){}};created.push(a);return a;}};
const ctx={document:doc,URL:{createObjectURL:()=>'blob:test/1',revokeObjectURL:u=>revoked.push(u)},setTimeout:(f,ms)=>timers.push([f,ms]),window:{open:()=>opened.push(1)},location:{set href(v){navigated=true}},downloadURL:null};
vm.createContext(ctx);vm.runInContext('var downloadURL=null;'+fn('saveBlob'),ctx);
vm.runInContext("saveBlob({type:'application/pdf'},'consent-2026-11-08.pdf')",ctx);
const a=created[0];assert.equal(a.tag,'a');assert.equal(a.download,'consent-2026-11-08.pdf');assert(a.download.endsWith('.pdf'));assert.equal(a.target,undefined,'no target=_blank');assert.equal(a.clicked,1);assert.equal(a.inDom,false,'anchor removed');
assert.equal(opened.length,0);assert.equal(navigated,false);assert.equal(revoked.length,0,'not revoked before download starts');assert.equal(timers[0][1],60000);timers[0][0]();assert.deepEqual(revoked,['blob:test/1']);
assert(!/window\.open|\.target\s*=|_blank/.test(js),'no viewer window in app code');assert(js.includes("saveBlob(blob,`consent-${today()}.pdf`)"));assert(js.includes("saveBlob(blob,`consent-${today()}.jpg`)")&&/JPG_MAX=300000/.test(js),'JPG option capped at 300,000 bytes');
// real makePDF against the shipped template
global.PDFLib=require(path.join(root,'vendor/pdf-lib.min.js'));const mk=new vm.Script(fn('makePDF')+';makePDF');const makePDF=mk.runInNewContext({PDFLib:global.PDFLib,Blob,Error});
const orig=fs.readFileSync(path.join(root,'assets/consent/original.pdf'));assert.equal(crypto.createHash('sha256').update(orig).digest('hex'),'98ff1bad3fabcd6ded07cfc896352967a6dae851db93ae2ade7a06cd13aec8c6');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==','base64');
(async()=>{const blob=await makePDF(orig,[png,png]);assert.equal(blob.type,'application/pdf');const out=await global.PDFLib.PDFDocument.load(await blob.arrayBuffer());assert.equal(out.getPageCount(),2);const {width,height}=out.getPage(0).getSize();assert(Math.abs(width-595.28)<1&&Math.abs(height-841.89)<1);console.log('synthetic PDF bytes',(await blob.arrayBuffer()).byteLength);
const src=read('i18n.js');const s=src.indexOf('const translations=')+19;const d=JSON.parse(src.slice(s,src.indexOf(';\nlet currentLanguage',s)));
const exp={ko:['동의완료','문서 보기'],en:['Complete consent','View document'],'zh-CN':['完成同意','查看文件'],'zh-TW':['完成同意','檢視文件'],ja:['同意完了','書類を表示']};for(const [l,[sv,pv]] of Object.entries(exp)){assert.equal(d[l].save,sv);assert.equal(d[l].preview,pv);assert.equal(d[l].entryPreview,pv);assert(!/PDF/.test(d[l].save+d[l].previewTitle),l);assert(/PDF/.test(d[l].downloadReady)&&/PDF/.test(d[l].loading)&&/PDF/.test(d[l].previewHelp),l+' says PDF');assert(!/JPG|JPEG/i.test(d[l].downloadReady+d[l].loading),l+' PDF status stays PDF');assert(/JPG/.test(d[l].previewHelp)&&/JPG/.test(d[l].downloadReadyJpg)&&/300/.test(d[l].jpgTooLarge),l+' help mentions the PDF/JPG choice');assert(d[l].previewHelp.includes(d[l].save),l+' help names the button');assert(/PDF/.test(d[l].uploadPDF),'upload link label unchanged');}
console.log('PASS: save downloads via hidden anchor (no target/_blank, no window.open/navigation, delayed revoke), app makePDF -> 2-page A4 application/pdf, labels ×5');})().catch(e=>{console.error(e);process.exit(1);});
