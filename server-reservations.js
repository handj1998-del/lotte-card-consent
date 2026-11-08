'use strict';
// Shared (server) reservations. Active ONLY when this page is served by the reservations Worker (same origin /api/status).
// Session = HttpOnly __Host- cookie set by the server; this script never sees or stores a token or password.
// Server keeps only reservation no, name, phone, email. Card data, expiry, signatures and PDFs are never sent.
// Password -> 256-bit key in the browser (PBKDF2-SHA256, 600,000 iterations, domain-separated username salt).
// Only this key is sent; the server adds its own random salt + secret pepper (HMAC). Must match worker CLIENT_ITER.
const ConsentKdf={ITER:600000,async derive(username,password){const e=new TextEncoder();const base=await crypto.subtle.importKey('raw',e.encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:e.encode('lotte-consent-reservations|v1|'+String(username).trim().toLowerCase()),iterations:ConsentKdf.ITER,hash:'SHA-256'},base,256);
  return btoa(String.fromCharCode(...new Uint8Array(bits))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}};
if(typeof module!=='undefined')module.exports={ConsentKdf};
if(typeof document!=='undefined')(function(){
  const $=id=>document.getElementById(id),IDLE_MS=120000;let on=false,idle=null,next=null,items=[],editing=null,busy=false;
  const msg=(k,x)=>window.consentResMsg(k,x),stage=n=>window.consentResStage(n);
  async function api(method,path,body){const o={method,credentials:'same-origin',cache:'no-store',headers:{'X-Requested-With':'consent'}};if(body!==undefined){o.headers['Content-Type']='application/json';o.body=JSON.stringify(body);}
    const r=await fetch(path,o);let j=null;try{j=await r.json();}catch{}return{s:r.status,j:j||{}};}
  function wipe(){on=false;items=[];next=null;editing=null;clearTimeout(idle);$('srvList').replaceChildren();$('srvForm').reset();$('srvForm').hidden=true;$('srvMore').hidden=true;for(const id of ['srvPass','srvNewPass','srvNewPass2','srvToken'])$(id).value='';}
  async function logout(quiet){const was=on;wipe();if(was)try{await fetch('api/logout',{method:'POST',credentials:'same-origin',keepalive:true,headers:{'X-Requested-With':'consent'}});}catch{}if(!quiet){stage('resLocked');msg('srvLoggedOut');}}
  function touch(){if(!on)return;clearTimeout(idle);idle=setTimeout(()=>{logout(true);stage('resLocked');msg('resAutoLocked');},IDLE_MS);}
  function expired(){wipe();stage('srvLogin');msg('srvExpired');}
  function btn(key,cls,fn){const b=document.createElement('button');b.type='button';b.className=cls;b.setAttribute('data-i18n',key);b.textContent=t(key);b.addEventListener('click',()=>{touch();fn();});return b;}
  function render(){const list=$('srvList');list.replaceChildren();if(!items.length){const li=document.createElement('li');li.className='res-empty';li.setAttribute('data-i18n','resEmpty');li.textContent=t('resEmpty');list.append(li);}
    for(const r of items){const li=document.createElement('li');li.className='res-item';const l=document.createElement('span');l.className='res-label';l.textContent=r.label;li.append(l,btn('resSelect','res-primary',()=>select(r)),btn('resEdit','',()=>edit(r)),btn('resDelete','res-danger',()=>remove(r)));list.append(li);}
    $('srvMore').hidden=!next;}
  async function load(more){const q='api/reservations?limit=50'+(more&&next?'&cursor='+encodeURIComponent(next):'');let r;try{r=await api('GET',q);}catch{msg('srvNetErr');return false;}
    if(r.s===401){expired();return false;}if(r.s!==200){msg('srvNetErr');return false;}items=more?items.concat(r.j.items):r.j.items;next=r.j.next;render();return true;}
  async function full(r){let x;try{x=await api('GET','api/reservations/'+r.id);}catch{msg('srvNetErr');return null;}if(x.s===401){expired();return null;}if(x.s===404){msg('srvConflict');await load(false);return null;}if(x.s!==200){msg('srvNetErr');return null;}return x.j;}
  async function select(r){const rec=await full(r);if(!rec)return;const copy={no:rec.no,name:rec.name,phone:rec.phone,email:rec.email};if(window.consentStartCustomer(copy))await logout(true);}
  async function edit(r){const rec=await full(r);if(!rec)return;editing={id:rec.id,version:rec.version};const f=$('srvForm');f.hidden=false;for(const k of ['no','name','phone','email'])f.elements[k].value=rec[k];f.elements.no.focus();}
  async function remove(r){if(!confirm(t('resDeleteConfirm')))return;let x;try{x=await api('DELETE','api/reservations/'+r.id+'?version='+r.version);}catch{msg('srvNetErr');return;}
    if(x.s===401)return expired();if(x.s===409||x.s===404){msg('srvConflict');await load(false);return;}if(x.s!==200){msg('srvNetErr');return;}await load(false);msg('resDeleted');}
  $('srvForm').addEventListener('submit',async e=>{e.preventDefault();if(busy)return;touch();const f=e.target.elements,body={no:f.no.value.trim(),name:f.name.value.trim(),phone:f.phone.value.trim(),email:f.email.value.trim()};
    if(!body.no||!body.name){msg('resRequired');return;}busy=true;let x;try{x=editing?await api('PUT','api/reservations/'+editing.id,{...body,version:editing.version}):await api('POST','api/reservations',body);}catch{x=null;}finally{busy=false;}
    if(!x){msg('srvNetErr');return;}if(x.s===401)return expired();if(x.s===409||x.s===404){msg('srvConflict');e.target.reset();e.target.hidden=true;editing=null;await load(false);return;}
    if(x.s!==200&&x.s!==201){msg('srvNetErr');return;}e.target.reset();e.target.hidden=true;editing=null;await load(false);msg('resSaved');});
  $('srvFormCancel').addEventListener('click',()=>{$('srvForm').reset();$('srvForm').hidden=true;editing=null;});
  $('srvAdd').addEventListener('click',()=>{touch();editing=null;const f=$('srvForm');f.reset();f.hidden=false;f.elements.no.focus();});
  $('srvRefresh').addEventListener('click',async()=>{touch();if(await load(false))msg('');});
  $('srvMore').addEventListener('click',()=>{touch();load(true);});
  $('srvLogout').addEventListener('click',()=>logout(false));
  for(const b of document.querySelectorAll('.srv-cancel'))b.addEventListener('click',()=>{wipe();stage('resLocked');msg('');});
  async function enter(){on=true;stage('srvAdmin');msg('');touch();await load(false);}
  $('srvLogin').addEventListener('submit',async e=>{e.preventDefault();const u=$('srvUser').value.trim(),p=$('srvPass').value;$('srvPass').value='';let x;try{x=await api('POST','api/login',{username:u,key:await ConsentKdf.derive(u,p)});}catch{msg('srvNetErr');return;}
    if(x.s===200)return enter();msg(x.s===429?'srvLocked':x.s===401?'srvBadLogin':'srvNetErr');});
  $('srvSetupForm').addEventListener('submit',async e=>{e.preventDefault();const tok=$('srvToken').value.trim(),u=$('srvNewUser').value.trim(),a=$('srvNewPass').value,b=$('srvNewPass2').value;$('srvNewPass').value=$('srvNewPass2').value='';
    if(a.length<12||a.length>128){msg('srvPassRule');return;}if(a!==b){msg('srvMismatch');return;}let x;try{x=await api('POST','api/setup',{token:tok,username:u,key:await ConsentKdf.derive(u,a)});}catch{msg('srvNetErr');return;}$('srvToken').value='';
    if(x.s===201)return enter();msg(x.s===429?'srvLocked':x.s===400?'srvPassRule':'srvSetupBad');});
  $('srvOpenBtn').addEventListener('click',async()=>{msg('');let x;try{x=await api('GET','api/status');}catch{msg('srvNetErr');return;}if(x.s!==200){msg('srvNotReady');return;}
    if(x.j.configured){try{const s=await api('GET','api/session');if(s.s===200)return enter();}catch{}stage('srvLogin');$('srvPass').focus();}else if(x.j.setupOpen){stage('srvSetup');$('srvToken').focus();}else msg('srvNotReady');});
  $('resScreen').addEventListener('input',touch);
  window.addEventListener('pagehide',()=>logout(true));document.addEventListener('visibilitychange',()=>{if(document.hidden&&on){logout(true);stage('resLocked');}});
  document.addEventListener('languagechange-consent',()=>{if(on)render();});
  // On the Worker origin the separate same-device (PIN) vault is hidden: browser storage is per-origin, so tablet records
  // stay on the GitHub Pages address untouched and are not mixed with the shared server list.
  // Show the entry point only when this origin really hosts the API (GitHub Pages has no /api -> stays hidden, local mode unchanged).
  fetch('api/status',{credentials:'same-origin',cache:'no-store'}).then(r=>r.ok&&/json/.test(r.headers.get('Content-Type')||'')?r.json():null).then(j=>{if(j&&typeof j.configured==='boolean'){$('srvOpenBtn').hidden=false;$('resAdminBtn').hidden=true;}}).catch(()=>{});
})();
