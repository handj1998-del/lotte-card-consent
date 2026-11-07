'use strict';
// Removed header flow line, header summary copy, guide title summary and explainer; utilities kept under "More".
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('index.html'),src=read('i18n.js');const s=src.indexOf('const translations=')+19;const d=JSON.parse(src.slice(s,src.indexOf(';\nlet currentLanguage',s)));
for(const k of ['flow','helpSummary','guideNote'])assert(!html.includes(`data-i18n="${k}"`),k);
for(const t of ['입력 → 서명','자동 전송 없음','원본 1쪽의 안내문','작성 전 안내 · 원본 1쪽'])assert(!html.includes(t),t);
for(const [l,t] of Object.entries(d)){assert(!t.flow&&!t.helpSummary&&!t.guideNote,l);assert(!/원본 1쪽|page 1|第 1 页|第 1 頁|1ページ/.test(t.guideTitle),l);assert(t.moreMenu,l);}
assert(!/<details[^>]*id="guidancePanel"/.test(html));assert(/<h2 id="guideHeading" class="sr-only"/.test(html));
for(const id of ['guideText','guideStart','guideReturn','clear','refresh'])assert(html.includes(`id="${id}"`),id);
for(const k of ['guideRetention','guideAck','guideRights'])assert(html.includes(`data-i18n="${k}"`),k);
console.log('PASS: removed strings absent ×5 languages, guide body/buttons and More utilities kept, hidden guide heading');
{const css=read('consent.css');
// no visible meta helper/explainer before the guide body: first visible child after the sr-only heading is #guideText
const panel=html.match(/<section id="guidancePanel"[^>]*>(.*?)<div id="guideText"/s)[1];assert.equal(panel.replace(/<h2 id="guideHeading" class="sr-only"[^>]*>[^<]*<\/h2>/,'').trim(),'',`unexpected guide meta: ${panel}`);
for(const [l,t] of Object.entries(d))assert(!('guideScroll' in t),l);assert(!html.includes('guide-scroll'));
assert(/(^|\})\.sr-only\{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect\(0,0,0,0\)/.test(css));assert(!/guideHeading|guidance-panel\s*>?\s*h2/.test(css),'sr-only heading not restyled');
console.log('PASS: guide starts directly with clause body; heading remains sr-only (visually hidden) in all languages');}
