'use strict';
// "문서 보기" / "다운로드" for the CURRENT form only: local, fresh each time, no persistence, download-only.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const js=read('consent.js'),html=read('index.html'),css=read('consent.css');
assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'assets/consent/original.pdf'))).digest('hex'),'98ff1bad3fabcd6ded07cfc896352967a6dae851db93ae2ade7a06cd13aec8c6');
// one entry point each in the header + matching buttons in the document view
assert.equal((html.match(/id="preview"/g)||[]).length,1);assert.equal((html.match(/id="save"/g)||[]).length,1);
assert(/<nav class="header-actions"[^]*?<button id="preview"[^>]*data-i18n="preview">문서 보기<\/button><button id="save"[^>]*data-i18n="save">동의완료<\/button>/.test(html));
assert(/<dialog id="previewDialog">[^]*id="savePreview"[^>]*>동의완료<\/button><button id="closePreview"[^>]*>닫기<\/button>[^]*<div id="previewPages"><\/div><\/dialog>/.test(html),'in-page view with download + close, empty until opened');
assert(/#preview,\.header-actions #save,#savePreview,#backPreview,#closePreview,#previewEntry\{font-size:18px;min-height:58px/.test(css));
// fresh render from current values each time; busy guard; validation before both
assert(js.includes("for(const id of ['preview','previewEntry'])document.getElementById(id).onclick=async()=>{if(docBusy||!validate())return;await savePDF({keepShare:true,button:document.getElementById(id)});};"),'문서 보기 = direct PDF, validated, keeps sharing');
assert(/document\.getElementById\('save'\)\.onclick=\(\)=>\{if\(docBusy\|\|dlg\.open\|\|!validate\(\)\)return;dlg\.showModal\(\)/.test(js),'동의완료 validates then opens the format chooser');assert(/async function savePDF\(o=\{\}\)\{[^\n]*if\(docBusy\)return;setDocBusy\(true\);[^\n]*fetch\('assets\/consent\/original\.pdf'[^\n]*renderOverlay\(page\)[^\n]*makePDF\(originalBytes,overlays\);saveBlob\(/.test(js),'download builds a fresh PDF from original + current overlay');
assert((js.match(/finally\{setDocBusy\(false\);/g)||[]).length>=2&&/finally\{setDocBusy\(false\);if\(btn\)btn\.textContent=t\(btn\.getAttribute\('data-i18n'\)\);\}/.test(js),'PDF (incl. 문서 보기) and JPG always release the busy lock and restore the label');
assert(/function validate\(\)\{const name=[^}]*alert\(t\('nameRequired'\)\)/.test(js),'missing required name is explained, no blank PDF');
assert(js.includes("addEventListener('close',clearPreview)")&&/function clearPreview\(\)\{[^\n]*c\.width=c\.height=1;[^\n]*replaceChildren\(\)/.test(js),'closing drops rendered pages');
assert(read('reservations.js').includes("const pd=document.getElementById('previewDialog');if(pd&&pd.open)pd.close();"),'new customer closes view');
// local only, download only
assert(!/localStorage|sessionStorage|indexedDB|window\.open|_blank|\.target\s*=/.test(js));
assert(!/fetch\((?!'assets\/consent\/original\.pdf')/.test(js),'no network except the bundled template');
const src=read('i18n.js');const st=src.indexOf('const translations=')+19;const d=JSON.parse(src.slice(st,src.indexOf(';\nlet currentLanguage',st)));
for(const l of ['ko','en','zh-CN','zh-TW','ja'])for(const k of ['preview','save','previewTitle','previewHelp','previewClose','downloadReady'])assert(d[l][k],l+k);
const dlgv=html.match(/<dialog id="reviewDialog"[^]*?<\/dialog>/)[0];assert(!/동의완료|data-i18n="save"/.test(dlgv),'PC review has no completion/download');
assert(!/\.checked=true|\.checked = true/.test(js),'no auto-check');
console.log('PASS: 동의완료 label, 문서 보기/다운로드 single entry points, in-page view (download+close), 18px/58px, fresh render, busy guard, validation, cleanup on close/new customer, local+download only, original PDF hash, 5 languages');
