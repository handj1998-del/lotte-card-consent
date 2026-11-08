'use strict';
// 동의완료 = download only (no viewer window/navigation) of ONE JPEG (both pages stacked); makePDF kept internal and still valid.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');const js=read('consent.js');
const fn=name=>js.match(new RegExp(`(async )?function ${name}\\(.*?\\n`,'s'))[0];
const created=[],opened=[],timers=[];let navigated=false,revoked=[];
const doc={body:{append:a=>{a.inDom=true}},createElement:tag=>{const a={tag,style:{},clicked:0,inDom:false,click(){this.clicked++},remove(){this.inDom=false},setAttribute(){}};created.push(a);return a;}};
const ctx={document:doc,URL:{createObjectURL:()=>'blob:test/1',revokeObjectURL:u=>revoked.push(u)},setTimeout:(f,ms)=>timers.push([f,ms]),window:{open:()=>opened.push(1)},location:{set href(v){navigated=true}},downloadURL:null};
vm.createContext(ctx);vm.runInContext('var downloadURL=null;'+fn('saveBlob'),ctx);
vm.runInContext("saveBlob({type:'image/jpeg'},'consent-2026-11-08.jpg')",ctx);
const a=created[0];assert.equal(a.tag,'a');assert.equal(a.download,'consent-2026-11-08.jpg');assert.equal(a.target,undefined,'no target=_blank');assert.equal(a.clicked,1);assert.equal(a.inDom,false,'anchor removed');
assert.equal(opened.length,0);assert.equal(navigated,false);assert.equal(revoked.length,0,'not revoked before download starts');assert.equal(timers[0][1],60000);timers[0][0]();assert.deepEqual(revoked,['blob:test/1']);
assert(!/window\.open|\.target\s*=|_blank/.test(js),'no viewer window in app code');assert(js.includes("const blob=await makeJPG();saveBlob(blob,`consent-${today()}.jpg`)")&&!js.includes('.pdf`)'),'one .jpg download, no PDF download');
// makeJPG: one 1754 x 2*2481 canvas, white bg, page1 above page2, pages released, JPEG 0.95, output canvas released
{const ops=[],pages=[];let outC;const mkCanvas=()=>{const cv={width:0,height:0,getContext:()=>({set fillStyle(v){ops.push(['fill',v]);},fillRect:(...a)=>ops.push(['rect',...a]),drawImage:(img,...a)=>ops.push(['draw',img.p,...a])}),toBlob(cb,type,q){ops.push(['toBlob',type,q,this.width,this.height]);cb({type});}};return cv;};
 const c2={document:{createElement:()=>outC=mkCanvas()},renderPage:async p=>{const pc={p,width:2482,height:3508};pages.push(pc);return pc;},Promise,Error,Math};vm.createContext(c2);
 vm.runInContext(js.match(/const JPG_W=.*\n/)[0].replace('const JPG_W','var JPG_W').replace(',JPG_PAGE_H',';var JPG_PAGE_H')+fn('makeJPG'),c2);
 c2.__done=vm.runInContext('makeJPG()',c2);global.__jpg=c2.__done.then(b=>{assert.equal(b.type,'image/jpeg');
  assert.deepEqual(ops[0],['fill','#fff']);assert.deepEqual(ops[1],['rect',0,0,1754,4962]);
  assert.deepEqual(ops.filter(o=>o[0]==='draw'),[['draw',1,0,0,1754,2481],['draw',2,0,2481,1754,2481]],'page 1 (source p3) above page 2');
  assert.deepEqual(ops.find(o=>o[0]==='toBlob'),['toBlob','image/jpeg',0.95,1754,4962]);assert(pages.every(p=>p.width===1&&p.height===1),'page canvases released');assert.equal(outC.width,1,'output canvas released');});}
// real makePDF against the shipped template
global.PDFLib=require(path.join(root,'vendor/pdf-lib.min.js'));const mk=new vm.Script(fn('makePDF')+';makePDF');const makePDF=mk.runInNewContext({PDFLib:global.PDFLib,Blob,Error});
const orig=fs.readFileSync(path.join(root,'assets/consent/original.pdf'));assert.equal(crypto.createHash('sha256').update(orig).digest('hex'),'98ff1bad3fabcd6ded07cfc896352967a6dae851db93ae2ade7a06cd13aec8c6');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==','base64');
(async()=>{await global.__jpg;const blob=await makePDF(orig,[png,png]);assert.equal(blob.type,'application/pdf');const out=await global.PDFLib.PDFDocument.load(await blob.arrayBuffer());assert.equal(out.getPageCount(),2);const {width,height}=out.getPage(0).getSize();assert(Math.abs(width-595.28)<1&&Math.abs(height-841.89)<1);
const src=read('i18n.js');const s=src.indexOf('const translations=')+19;const d=JSON.parse(src.slice(s,src.indexOf(';\nlet currentLanguage',s)));
const exp={ko:['동의완료','문서 보기'],en:['Complete consent','View document'],'zh-CN':['完成同意','查看文件'],'zh-TW':['完成同意','檢視文件'],ja:['同意完了','書類を表示']};for(const [l,[sv,pv]] of Object.entries(exp)){assert.equal(d[l].save,sv);assert.equal(d[l].preview,pv);assert.equal(d[l].entryPreview,pv);assert(!/PDF/.test(d[l].save+d[l].previewTitle+d[l].downloadReady),l);assert(d[l].previewHelp.includes(d[l].save),l+' help names the button');assert(/PDF/.test(d[l].uploadPDF),'upload link label unchanged');}
console.log('PASS: one 1754x4962 JPEG (q .95, white, p1 over p2, canvases released) via hidden anchor (no target/_blank, no window.open/navigation, delayed revoke), app makePDF -> 2-page A4 application/pdf, labels ×5');})().catch(e=>{console.error(e);process.exit(1);});
