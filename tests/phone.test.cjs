'use strict';
// Phone country-code helper: shown for en/zh-CN/zh-TW/ja, hidden (and not referenced) for ko. Display only.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const js=read('consent.js'),css=read('consent.css'),src=read('i18n.js');
const s=src.indexOf('const translations=')+19;const d=JSON.parse(src.slice(s,src.indexOf(';\nlet currentLanguage',s)));
const expect={en:'country calling code','zh-CN':'国家/地区代码','zh-TW':'國家／地區代碼',ja:'国番号'};
for(const [l,w] of Object.entries(expect))assert(d[l].phoneHelp.includes(w),l);
assert(css.includes('html[lang="ko"] .phone-help{display:none}'));
// run the language hook against a stub to verify hide/show + aria
const hook=js.match(/const ph=document\.getElementById\('phoneHelp'\);if\(ph\)\{.*?'phoneHelp'\);\}/)[0];
const input={attrs:{},value:'+44 20 0000 0000',setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]}};
const ph={hidden:false,previousElementSibling:input};const doc={documentElement:{lang:'ko'},getElementById:()=>ph};
for(const l of ['ko','en','zh-CN','zh-TW','ja','ko']){doc.documentElement.lang=l;vm.runInNewContext(hook,{document:doc});
 assert.equal(ph.hidden,l==='ko',l);assert.equal(input.attrs['aria-describedby'],l==='ko'?undefined:'phoneHelp',l);}
assert.equal(input.value,'+44 20 0000 0000');
assert(!/phone[^;]{0,60}(pattern|setCustomValidity|\+82|\+81)/i.test(js),'no new phone validation/forced code');
assert(js.includes("help.setAttribute('data-i18n','phoneHelp')"));
console.log('PASS: phone helper 4 languages shown / Korean hidden + aria-describedby toggled, value untouched, no new validation');
