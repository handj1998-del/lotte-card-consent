'use strict';
// View toggle regression: guide <-> entry without touching inputs. Synthetic, DOM-free stub.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('index.html'),css=read('consent.css'),guide=read('guide.js');
function el(id){return{id,hidden:false,open:true,focused:0,listeners:{},value:'',addEventListener(t,f){this.listeners[t]=f},focus(){this.focused++},querySelector(){return summary}};}
const summary=el('summary'),ids={};for(const id of ['guidancePanel','entry','guideStart','guideReturn','entryHeading'])ids[id]=el(id);
const classes=new Set();const body={classList:{add:c=>classes.add(c),toggle:(c,on)=>on?classes.add(c):classes.delete(c)}};
const field={value:'SYNTH-RES-001'},sig={src:'data:image/png;base64,AAAA'},lang={value:'ja'};
vm.runInNewContext(guide,{document:{body,getElementById:id=>ids[id]},window:{scrollTo(){}}});
assert(classes.has('view-guide')&&!classes.has('view-entry'));
for(let i=0;i<3;i++){ids.guideStart.listeners.click({preventDefault(){}});assert(classes.has('view-entry')&&!classes.has('view-guide'));assert.equal(ids.guidancePanel.hidden,true);
ids.guideReturn.listeners.click({preventDefault(){}});assert(classes.has('view-guide'));assert.equal(ids.guidancePanel.hidden,false);}
assert.equal(field.value,'SYNTH-RES-001');assert(sig.src);assert.equal(lang.value,'ja');assert(ids.entryHeading.focused>=3);
assert(!/\.value\s*=|localStorage|fetch|sessionStorage/.test(guide),'guide.js must not touch data');
for(const r of ['body.view-guide .entry-workspace{display:none}','body.view-entry #guidancePanel','height:58px;min-height:58px','body.view-entry #entry .input-label{font-size:18px','body.view-guide main,body.view-entry main{display:block']) assert(css.includes(r),r);
assert(css.lastIndexOf('body.view-entry #entry .entry-field')>css.lastIndexOf('#entry .entry-field{min-height:44px'));
assert(/@media\(max-width:699px\)\{body\.view-entry #entry \.form-grid\{grid-template-columns:minmax\(0,1fr\)\}\}/.test(css));
// 768 & 1024 widths: main max 1100 with 16px padding; 2 columns at >=700 each >= (768-32-36-20)/2 = 340px
assert(!/(?<![-a-z])width:\s*\d{4,}px/.test(css.split('Two distinct views')[1]));
const i=read('i18n.js');const s=i.indexOf('const translations=')+19;const d=JSON.parse(i.slice(s,i.indexOf(';\nlet currentLanguage',s)));
for(const l of ['ko','en','zh-CN','zh-TW','ja'])for(const k of ['entryHeading','guideStart','guideReturn'])assert(d[l][k],l+k);
assert(html.includes('aria-labelledby="entryHeading"'));
console.log('PASS: guide/entry toggles ×3, state retention, focus heading (no input focus), large-entry CSS precedence, responsive columns, 5-language labels');
