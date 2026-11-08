'use strict';
// Same-tablet reservation manager (local only, no network).
// Stores ONLY reservation number, name, phone, email (+id/timestamps) encrypted with AES-GCM;
// key = PBKDF2-SHA256(PIN, random per-device salt). The PIN itself is never stored.
// Card data, expiry, signatures, the PDF and the rest of the form are never persisted.
const ReservationVault=(()=>{
  const KEY='lotteConsentReservations.v1',ITER=600000,enc=new TextEncoder(),dec=new TextDecoder();
  const b64=u=>btoa(String.fromCharCode(...new Uint8Array(u))),unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
  const storage=()=>globalThis.localStorage;
  async function derive(pin,salt,iter){const base=await crypto.subtle.importKey('raw',enc.encode(pin),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:iter,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
  async function seal(key,salt,iter,records){const iv=crypto.getRandomValues(new Uint8Array(12));const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,enc.encode(JSON.stringify(records)));storage().setItem(KEY,JSON.stringify({v:1,iter,salt:b64(salt),iv:b64(iv),ct:b64(ct)}));}
  function raw(){try{const o=JSON.parse(storage().getItem(KEY)||'null');return o&&o.v===1?o:null;}catch{return null;}}
  const clean=r=>({id:String(r.id||crypto.randomUUID()),no:String(r.no||'').trim().slice(0,40),name:String(r.name||'').trim().slice(0,80),phone:String(r.phone||'').trim().slice(0,40),email:String(r.email||'').trim().slice(0,120),created:r.created||Date.now(),updated:Date.now()});
  return{
    exists:()=>!!raw(),
    async setup(pin){if(raw())throw Error('exists');const salt=crypto.getRandomValues(new Uint8Array(16));const key=await derive(pin,salt,ITER);await seal(key,salt,ITER,[]);return{key,salt,iter:ITER,records:[]};},
    async unlock(pin){const o=raw();if(!o)throw Error('missing');const salt=unb64(o.salt);const key=await derive(pin,salt,o.iter);let pt;try{pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(o.iv)},key,unb64(o.ct));}catch{throw Error('badpin');}return{key,salt,iter:o.iter,records:JSON.parse(dec.decode(pt))};},
    async save(s){s.records=s.records.map(r=>({...r}));await seal(s.key,s.salt,s.iter,s.records);},
    clean,
    async changePin(s,newPin){const salt=crypto.getRandomValues(new Uint8Array(16));const key=await derive(newPin,salt,ITER);await seal(key,salt,ITER,s.records);s.key=key;s.salt=salt;s.iter=ITER;},
    maskNo:v=>{v=String(v);return v.length<=4?v.replace(/.(?=.)/g,'•'):v.slice(0,2)+'•'.repeat(Math.max(1,v.length-5))+v.slice(-3);},
    maskName:v=>{const c=[...String(v)];return c.length<=1?c.join(''):c.length===2?c[0]+'•':c[0]+'•'.repeat(c.length-2)+c[c.length-1];},
    KEY
  };
})();
if(typeof module!=='undefined')module.exports={ReservationVault};

if(typeof document!=='undefined')(function(){
  const $=id=>document.getElementById(id);let session=null,failures=0,lockUntil=0,idle=null,editingId=null;
  const IDLE_MS=120000;
  function setMsg(key,extra){const m=$('resMsg');m.textContent=key?t(key)+(extra||''):'';}
  function stage(name){for(const id of ['resLocked','resSetup','resUnlock','resAdmin','srvSetup','srvLogin','srvAdmin'])$(id).hidden=id!==name;}
  function lock(){session=null;editingId=null;clearTimeout(idle);$('resList').replaceChildren();$('resForm').reset();$('resForm').hidden=true;$('resPinForm').reset();$('resPinForm').hidden=true;for(const f of document.querySelectorAll('#resScreen input[type=password]'))f.value='';stage('resLocked');}
  function touch(){if(!session)return;clearTimeout(idle);idle=setTimeout(()=>{lock();setMsg('resAutoLocked');},IDLE_MS);}
  function renderList(){const list=$('resList');list.replaceChildren();if(!session.records.length){const p=document.createElement('li');p.className='res-empty';p.textContent=t('resEmpty');list.append(p);return;}
    for(const r of session.records){const li=document.createElement('li');li.className='res-item';const label=document.createElement('span');label.className='res-label';label.textContent=`${r.no} · ${ReservationVault.maskName(r.name)}`;
      const sel=btn('resSelect','res-primary',()=>select(r.id)),ed=btn('resEdit','',()=>openForm(r)),del=btn('resDelete','res-danger',()=>remove(r.id));li.append(label,sel,ed,del);list.append(li);}}
  function btn(key,cls,fn){const b=document.createElement('button');b.type='button';b.className=cls;b.setAttribute('data-i18n',key);b.textContent=t(key);b.addEventListener('click',()=>{touch();fn();});return b;}
  function openForm(r){editingId=r?r.id:null;const f=$('resForm');f.hidden=false;f.elements.no.value=r?r.no:'';f.elements.name.value=r?r.name:'';f.elements.phone.value=r?r.phone:'';f.elements.email.value=r?r.email:'';f.elements.no.focus();}
  async function remove(id){if(!confirm(t('resDeleteConfirm')))return;session.records=session.records.filter(r=>r.id!==id);await ReservationVault.save(session);renderList();setMsg('resDeleted');}
  function formDirty(){const filled=fields.some(f=>f.el.type!=='date'&&f.el.value.trim());return filled||signatures.some(s=>s.image);}
  function clearCustomerForm(){const pd=document.getElementById('previewDialog');if(pd&&pd.open)pd.close();fields.forEach(f=>f.el.value=f.el.type==='date'&&['1쪽 서명 날짜','임차인 날짜'].includes(f.label)?today():'');if(typeof choices!=='undefined')choices.forEach(c=>c.el.checked=false);signatures.forEach(s=>{s.image=null;s.el.setAttribute('data-i18n','signButton');s.el.textContent=t('signButton');});document.getElementById('cardFields').dispatchEvent(new Event('input'));const cf=fields.find(f=>f.label==='카드번호');if(cf)cf.el.dispatchEvent(new Event('input'));}
  function fill(r){const set=(label,v)=>{const f=fields.find(x=>x.label===label);f.el.value=v;f.el.dispatchEvent(new Event('input',{bubbles:true}));};set('예약번호',r.no);set('임차인 이름',r.name);set('전화번호',r.phone);set('이메일',r.email);}
  function startCustomer(r){if(formDirty()&&!confirm(t('resClearConfirm'))){return false;}if(window.consentReviewStop)window.consentReviewStop();clearCustomerForm();if(r)fill(r);lock();setMsg('');window.consentShowView('guide');return true;}
  function select(id){const r=session&&session.records.find(x=>x.id===id);if(!r)return;const copy={...r};startCustomer(copy);}
  async function withBackoff(fn){const now=Date.now();if(now<lockUntil){setMsg('resWait',` (${Math.ceil((lockUntil-now)/1000)}s)`);return;}try{await fn();failures=0;}catch(e){if(e.message!=='badpin')throw e;failures++;lockUntil=Date.now()+Math.min(60000,1000*2**Math.max(0,failures-2));setMsg('resBadPin');}}
  const pinOk=v=>/^\d{4,12}$/.test(v);
  $('resAdminBtn').addEventListener('click',()=>{setMsg('');if(ReservationVault.exists()){stage('resUnlock');$('resPin').focus();}else{stage('resSetup');$('resNewPin').focus();}});
  $('resNoBooking').addEventListener('click',()=>startCustomer(null));
  $('resSetup').addEventListener('submit',async e=>{e.preventDefault();const a=$('resNewPin').value,b=$('resNewPin2').value;if(!pinOk(a)){setMsg('resPinRule');return;}if(a!==b){setMsg('resPinMismatch');return;}session=await ReservationVault.setup(a);$('resNewPin').value=$('resNewPin2').value='';stage('resAdmin');renderList();touch();setMsg('resSetupDone');});
  $('resUnlock').addEventListener('submit',async e=>{e.preventDefault();const pin=$('resPin').value;$('resPin').value='';await withBackoff(async()=>{session=await ReservationVault.unlock(pin);stage('resAdmin');renderList();touch();setMsg('');});});
  $('resCancelSetup').addEventListener('click',()=>{lock();setMsg('');});$('resCancelUnlock').addEventListener('click',()=>{lock();setMsg('');});
  $('resLock').addEventListener('click',()=>{lock();setMsg('resLockedMsg');});
  $('resAdd').addEventListener('click',()=>{touch();openForm(null);});
  $('resFormCancel').addEventListener('click',()=>{$('resForm').reset();$('resForm').hidden=true;editingId=null;});
  $('resForm').addEventListener('submit',async e=>{e.preventDefault();touch();const f=e.target.elements;if(!f.no.value.trim()||!f.name.value.trim()){setMsg('resRequired');return;}const prev=session.records.find(r=>r.id===editingId);const rec=ReservationVault.clean({...(prev||{}),no:f.no.value,name:f.name.value,phone:f.phone.value,email:f.email.value});session.records=prev?session.records.map(r=>r.id===prev.id?rec:r):[...session.records,rec];await ReservationVault.save(session);e.target.reset();e.target.hidden=true;editingId=null;renderList();setMsg('resSaved');});
  $('resChangePin').addEventListener('click',()=>{touch();$('resPinForm').hidden=false;$('resCurPin').focus();});
  $('resPinCancel').addEventListener('click',()=>{$('resPinForm').reset();$('resPinForm').hidden=true;});
  $('resPinForm').addEventListener('submit',async e=>{e.preventDefault();touch();const cur=$('resCurPin').value,a=$('resChPin').value,b=$('resChPin2').value;e.target.reset();if(!pinOk(a)){setMsg('resPinRule');return;}if(a!==b){setMsg('resPinMismatch');return;}await withBackoff(async()=>{await ReservationVault.unlock(cur);await ReservationVault.changePin(session,a);e.target.hidden=true;setMsg('resPinChanged');});});
  $('resScreen').addEventListener('input',touch);
  window.addEventListener('pagehide',lock);document.addEventListener('visibilitychange',()=>{if(document.hidden)lock();});
  $('resBack').addEventListener('click',()=>{lock();setMsg('');window.consentShowView('reserve');});
  document.addEventListener('languagechange-consent',()=>{if(session)renderList();});
  window.consentStartCustomer=startCustomer;window.consentResStage=stage;window.consentResMsg=setMsg;
  lock();
})();
