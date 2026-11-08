'use strict';
// Bug t79: going 입력 -> 예약 화면 -> back must not reset the draft. Emulates the real reservations.js functions (no browser).
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');const js=read('reservations.js'),html=read('index.html');
const grab=name=>{const m=js.match(new RegExp(`(?:const val=l=>.*?;\\n\\s*)?function ${name.replace('(','\\(')}.*?\\n`,'s'));assert(m,name);return m[0];};
const src=['function formDirty(','function sameCustomer(','function resumeDraft(','function updateResume(','function clearCustomerForm(','function fill(','function startCustomer('].map(n=>js.match(new RegExp(n.replace('(','\\(')+'.*?(?=\\n)','s'))[0]).join('\n');
const valLine=js.match(/const val=l=>.*?;(?=\n)/)[0];
function setup(){const mk=(label,type='text')=>({label,el:{type,value:'',dispatchEvent(){},addEventListener(){}}});
  const fields=['예약번호','임차인 이름','전화번호','이메일','카드번호','유효기간 MM/YYYY','카드사'].map(l=>mk(l)).concat([mk('1쪽 서명 날짜','date')]);
  const choices=[{el:{checked:false}}],signatures=[{image:null,el:{setAttribute(){},textContent:''}},{image:null,el:{setAttribute(){},textContent:''}}];
  const log=[];let confirmAnswer=true;const el={hidden:true,dispatchEvent(){},open:false,close(){}};
  const ctx={fields,choices,signatures,log,today:()=>'2026-11-08',t:k=>k,confirm:()=>{log.push('confirm');return confirmAnswer;},setConfirm:v=>confirmAnswer=v,
    document:{getElementById:()=>el},$:()=>el,lock:()=>log.push('lock'),setMsg:()=>{},Event:class{},window:{consentShowView:v=>log.push('view:'+v),consentReviewStop:()=>log.push('reviewStop')}};
  vm.createContext(ctx);vm.runInContext(valLine+'\n'+src,ctx);return ctx;}
const fillDraft=c=>{const set=(l,v)=>c.fields.find(f=>f.label===l).el.value=v;set('예약번호','TEST-RES-0001');set('임차인 이름','TEST USER');set('카드번호','4111 1111 1111 1111');set('유효기간 MM/YYYY','12/30');c.signatures[0].image={src:'data:image/png;base64,AAAA'};c.choices[0].el.checked=true;};
const snap=c=>JSON.stringify([c.fields.map(f=>f.el.value),c.signatures.map(s=>!!s.image),c.choices.map(x=>x.el.checked)]);
// 1) resume button: draft intact, no confirm, no review stop
{const c=setup();fillDraft(c);const before=snap(c);vm.runInContext('updateResume();resumeDraft()',c);assert.equal(snap(c),before);assert.deepEqual(c.log,['lock','view:entry']);}
// 2) re-selecting the SAME reservation keeps everything (the reported reset)
{const c=setup();fillDraft(c);const before=snap(c);assert.equal(vm.runInContext("startCustomer({no:'TEST-RES-0001',name:'TEST USER',phone:'',email:''})",c),true);assert.equal(snap(c),before,'same customer: draft kept');assert(!c.log.includes('confirm')&&!c.log.includes('reviewStop'));assert(c.log.includes('view:entry'));}
// 3) DIFFERENT customer: confirm; cancel keeps draft; OK clears all + stops review + fills new
{const c=setup();fillDraft(c);const before=snap(c);c.setConfirm(false);assert.equal(vm.runInContext("startCustomer({no:'TEST-RES-0002',name:'OTHER TEST',phone:'',email:''})",c),false);assert.equal(snap(c),before,'cancel keeps draft');
 c.setConfirm(true);vm.runInContext("startCustomer({no:'TEST-RES-0002',name:'OTHER TEST',phone:'',email:''})",c);assert.equal(c.fields.find(f=>f.label==='카드번호').el.value,'');assert.equal(c.signatures[0].image,null);assert.equal(c.choices[0].el.checked,false);assert.equal(c.fields[0].el.value,'TEST-RES-0002');assert(c.log.includes('reviewStop'));}
// 4) 예약 없이 작성 on a dirty draft asks first; checkboxes alone count as a draft
{const c=setup();c.choices[0].el.checked=true;c.setConfirm(false);assert.equal(vm.runInContext('formDirty()',c),true);assert.equal(vm.runInContext('startCustomer(null)',c),false);assert.equal(c.choices[0].el.checked,true);}
// 5) empty reservation number never counts as "same customer"
{const c=setup();assert.equal(vm.runInContext("sameCustomer({no:'',name:''})",c),false);}
// static: resume button present + 5 languages; back button / view switches do not clear; storage unchanged
assert(/<button id="resResume"[^>]*hidden[^>]*data-i18n="resResume">/.test(html));
assert(js.includes("$('resBack').addEventListener('click',()=>{lock();setMsg('');window.consentShowView('reserve');"),'back only switches view');
assert(!/clearCustomerForm|\.value=''/.test(read('guide.js')),'guide/readagain never clears');
assert(!/localStorage|indexedDB/.test(read('consent.js')+read('guide.js')+read('review.js')),'no new persistence');
const s=read('i18n.js');const st=s.indexOf('const translations=')+19;const d=JSON.parse(s.slice(st,s.indexOf(';\nlet currentLanguage',st)));for(const l of ['ko','en','zh-CN','zh-TW','ja'])assert(d[l].resResume,l);
console.log('PASS: draft kept on back/resume and same-customer reselect; different customer confirm/clear/review stop; checkbox-only draft; 5 languages');
