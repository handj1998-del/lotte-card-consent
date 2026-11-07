'use strict';
// Synthetic data only. Exercises shipped consent.js helpers, guide coverage and the PDF pipeline.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const js=read('consent.js');const grab=name=>{const m=js.match(new RegExp(`function ${name}\\([^)]*\\)\\{.*?\\}(?=\\n|function )`,'s'));assert(m,name);return m[0];};
const ctx={};vm.createContext(ctx);vm.runInContext([grab('luhnCheck'),grab('checkExpiry'),js.match(/function cardState\(.*?\}(?=\nfunction updateCardStatus)/s)[0]].join('\n'),ctx);
const {luhnCheck,checkExpiry,cardState}=ctx;
const VALID='4111111111111111',BAD='4111111111111112';// public test numbers
assert.equal(cardState('',false),'empty');assert.equal(cardState('4111 11',false),'incomplete');assert.equal(cardState('4111 11',true),'invalid');
assert.equal(cardState(VALID,false),'valid');assert.equal(cardState(BAD,false),'invalid');assert.equal(cardState(BAD,true),'invalid');assert.equal(luhnCheck('378282246310005'),true);
const yy=String((new Date().getFullYear()+2)%100).padStart(2,'0');
assert(checkExpiry(`12/${yy}`));assert(!checkExpiry(`13/${yy}`));assert(!checkExpiry(`00/${yy}`));assert(!checkExpiry(`12/20${yy}`));assert(!checkExpiry('01/20'));
assert(js.includes("el.placeholder='MM/YY';el.maxLength=5;"));assert(js.includes("aria-live','polite'"));assert(!/fetch\((?!'assets\/consent\/original\.pdf')/.test(js));assert(!/localStorage|sessionStorage|indexedDB|sendBeacon|XMLHttpRequest/.test(js+read('guide.js')));assert(!/cvv|cvc/i.test(js.replace(/noCvv/g,'')));
// guide coverage
const src=read('i18n.js');const s=src.indexOf('const translations=')+19;const d=JSON.parse(src.slice(s,src.indexOf(';\nlet currentLanguage',s)));
const html=read('index.html');const guideKeys=['guideIntro','guideExtra','guideDamage','guideFines','guideTolls','guideRecovery','guideItems','guideRetention','guideStorageScope','guideNotification','guidePayment','guideRights','guideSigning','guideAck','guideEligibility'];
for(const k of guideKeys)assert(html.includes(`data-i18n="${k}"`),k);
const nums={ko:'90일',en:'90 days','zh-CN':'90 天','zh-TW':'90 天',ja:'90日'};const after={ko:'반납한 후',en:'following the return','zh-CN':'归还后','zh-TW':'歸還後',ja:'返却後'};
for(const [l,t] of Object.entries(d)){assert(t.guideRetention.includes(nums[l]),l);assert(t.guideRetention.includes(after[l]),l);assert(t.cardFormatValid&&t.cardFormatInvalid&&t.cardFormatTyping&&t.cardFormatNote);for(const k of guideKeys)assert(t[k].length>8,l+k);}
assert.equal(d.en.guideRetention.match(/90/g).length,1);assert(d.ko.cardFormatValid.includes('형식이 맞습니다'));assert(d.ko.cardFormatInvalid.includes('형식이 맞지 않습니다'));
console.log('PASS: Luhn/format states, MM/YY 01–12 + expiry, no storage/network/CVV, 15 guide clauses × 5 languages, 90-days-following-return invariant');
