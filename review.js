'use strict';
// Live PC review of the CURRENT tablet form (read-only on the PC). Works only on the Worker origin with a signed-in session.
// Data path: tablet -> (AES-GCM-256, key from ECDH P-256 per viewer) -> in-memory relay -> PC. Nothing is stored anywhere:
// no server storage, no browser storage, no logging. Sharing stops on 중지, new customer, sign-out or after 30 min.
const ConsentReview=(()=>{
  const enc=new TextEncoder(),dec=new TextDecoder();
  const b64=u=>btoa(String.fromCharCode(...new Uint8Array(u))),unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
  const ECDH={name:'ECDH',namedCurve:'P-256'};
  async function keyPair(){const kp=await crypto.subtle.generateKey(ECDH,false,['deriveKey']);return{priv:kp.privateKey,pub:await crypto.subtle.exportKey('jwk',kp.publicKey)};}
  function cleanJwk(j){if(!j||j.kty!=='EC'||j.crv!=='P-256'||typeof j.x!=='string'||typeof j.y!=='string')throw Error('jwk');return{kty:'EC',crv:'P-256',x:j.x,y:j.y,ext:true};}
  async function shared(priv,peerJwk){const peer=await crypto.subtle.importKey('jwk',cleanJwk(peerJwk),ECDH,false,[]);return crypto.subtle.deriveKey({name:'ECDH',public:peer},priv,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
  async function seal(key,obj){const iv=crypto.getRandomValues(new Uint8Array(12));return{iv:b64(iv),ct:b64(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,enc.encode(JSON.stringify(obj))))};}
  async function open(key,m){return JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(m.iv)},key,unb64(m.ct))));}
  return{keyPair,shared,seal,open,cleanJwk};
})();
if(typeof module!=='undefined')module.exports={ConsentReview};

if(typeof document!=='undefined')(function(){
  const $=id=>document.getElementById(id),R=ConsentReview,SHARE_MS=30*60e3;
  const wsURL=role=>(location.protocol==='https:'?'wss://':'ws://')+location.host+'/api/review?role='+role;
  // ---------- tablet: publisher ----------
  let pub=null;// {ws,viewers:Map(id->key),last:string,timer,until}
  function snapshot(){const card=fields.find(f=>f.label==='카드번호').el.value,exp=fields.find(f=>f.label==='유효기간 MM/YYYY').el.value,name=fields.find(f=>f.label==='임차인 이름').el.value.trim();
    return{v:1,n:fields.length,fields:fields.map(f=>[f.label,f.el.value]),choices:choices.map(c=>!!c.el.checked),sigs:signatures.map(s=>s.image?s.image.src:null),
      check:{name:!!name,card:card?(luhnCheck(card)?'valid':'invalid'):'empty',expiry:exp?(checkExpiry(exp)?'valid':'invalid'):'empty',renterSign:!!signatures[0].image}};}
  function shareUI(){const b=$('reviewShareBtn'),st=$('reviewShareStatus');if(!b)return;b.setAttribute('data-i18n',pub?'rvStop':'rvStart');b.textContent=t(pub?'rvStop':'rvStart');b.classList.toggle('active',!!pub);
    if(pub){st.setAttribute('data-i18n-vars','');st.textContent=t('rvSharing',{n:pub.viewers.size});}}
  function shareMsg(k){const st=$('reviewShareStatus');if(st)st.textContent=k?t(k):'';}
  async function push(force){if(!pub||pub.ws.readyState!==1)return;if(Date.now()>pub.until){stopShare('rvExpired');return;}const snap=snapshot();const s=JSON.stringify(snap);if(!force&&s===pub.last)return;pub.last=s;
    for(const [id,key] of pub.viewers){const m=await R.seal(key,{...snap,at:Date.now()});if(pub)pub.ws.send(JSON.stringify({t:'data',to:id,...m}));}}
  async function startShare(){if(pub)return;shareMsg('');let ok=false;try{ok=(await fetch('api/session',{credentials:'same-origin',cache:'no-store'})).status===200;}catch{}
    if(!ok){shareMsg('rvNeedLogin');return;}
    const ws=new WebSocket(wsURL('pub'));const me={ws,viewers:new Map(),last:'',until:Date.now()+SHARE_MS,timer:null};pub=me;shareUI();
    ws.onmessage=async e=>{if(pub!==me)return;let m;try{m=JSON.parse(e.data);}catch{return;}
      if(m.t==='hello'&&typeof m.from==='string'){try{const kp=await R.keyPair();const key=await R.shared(kp.priv,m.pub);ws.send(JSON.stringify({t:'key',to:m.from,pub:kp.pub}));me.viewers.set(m.from,key);const sm=await R.seal(key,{...snapshot(),at:Date.now()});ws.send(JSON.stringify({t:'data',to:m.from,...sm}));shareUI();}catch{}}
      else if(m.t==='subgone'){me.viewers.delete(m.id);shareUI();}};
    ws.onclose=e=>{if(pub===me){pub=null;clearInterval(me.timer);me.viewers.clear();shareUI();shareMsg(e.code===4002?'rvExpired':e.code===4001?'rvReplaced':'rvStopped');}};
    me.timer=setInterval(()=>push(false),400);}
  function stopShare(msgKey){const me=pub;if(!me)return;pub=null;clearInterval(me.timer);try{if(me.ws.readyState===1)me.ws.send(JSON.stringify({t:'end'}));me.ws.close(1000,'stop');}catch{}me.viewers.clear();me.last='';shareUI();shareMsg(msgKey||'rvStopped');}
  window.consentReviewStop=stopShare;
  // ---------- PC: read-only viewer ----------
  let view=null;// {ws,kp,key,lastAt}
  function clearView(){$('rvFields').replaceChildren();$('rvSigs').replaceChildren();$('rvChecks').replaceChildren();$('rvPages').querySelectorAll('canvas').forEach(c=>{c.width=c.height=1;});$('rvPages').replaceChildren();}
  function viewState(k,vars){const s=$('rvState');s.dataset.state=k;s.textContent=t(k,vars||{});}
  const label=l=>{const k=fieldKeys[l];return k?t(k)+(/운전자/.test(l)?' · '+l:''):l;};
  let renderSeq=0;
  async function renderDoc(snap){const seq=++renderSeq;if(snap.n!==fields.length)return;// same app version only
    const saved={f:fields.map(f=>f.el.value),c:choices.map(c=>c.el.checked),s:signatures.map(s=>s.image)};const canvases=[];
    try{const imgs=await Promise.all(snap.sigs.map(src=>{if(!src||!/^data:image\/png;base64,/.test(src))return null;const i=new Image();i.src=src;return i.decode().then(()=>i,()=>null);}));
      fields.forEach((f,i)=>{f.el.value=snap.fields[i][1];});choices.forEach((c,i)=>{c.el.checked=!!snap.choices[i];});signatures.forEach((s,i)=>{s.image=imgs[i];});
      for(let p=1;p<=2;p++)canvases.push(await renderPage(p));}
    catch{}finally{fields.forEach((f,i)=>{f.el.value=saved.f[i];});choices.forEach((c,i)=>{c.el.checked=saved.c[i];});signatures.forEach((s,i)=>{s.image=saved.s[i];});}
    if(seq!==renderSeq||!view){canvases.forEach(c=>{c.width=c.height=1;});return;}
    const area=$('rvPages');area.querySelectorAll('canvas').forEach(c=>{c.width=c.height=1;});area.replaceChildren(...canvases);}
  function show(snap){const tb=$('rvFields');tb.replaceChildren();for(const [l,v] of snap.fields){if(!v)continue;const tr=document.createElement('tr'),th=document.createElement('th'),td=document.createElement('td');th.textContent=label(l);td.textContent=v;if(l==='카드번호')td.className='rv-card';tr.append(th,td);tb.append(tr);}
    if(!tb.children.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=2;td.textContent=t('rvBlank');tr.append(td);tb.append(tr);}
    const ck=$('rvChecks');ck.replaceChildren();const item=(k,state)=>{const li=document.createElement('li');li.dataset.state=state;li.textContent=t(k)+': '+t(state==='valid'||state===true?'rvOk':state==='empty'||state===false?'rvEmpty':'rvBad');ck.append(li);};
    item('rvNameLbl',snap.check.name);item('rvCardLbl',snap.check.card);item('rvExpiryLbl',snap.check.expiry);item('rvSignLbl',snap.check.renterSign);
    const sg=$('rvSigs');sg.replaceChildren();snap.sigs.forEach((src,i)=>{if(!src||!/^data:image\/png;base64,/.test(src)||i===1)return;const fig=document.createElement('figure'),img=document.createElement('img'),cap=document.createElement('figcaption');img.src=src;img.alt=t(signatureKey(signatures[i]));cap.textContent=t(signatureKey(signatures[i]));fig.append(img,cap);sg.append(fig);});
    renderDoc(snap);}
  async function openView(){if(view)return;clearView();$('reviewDialog').showModal();viewState('rvWaiting');
    const ws=new WebSocket(wsURL('sub'));const kp=await R.keyPair();const me={ws,kp,key:null,lastAt:0};view=me;
    const hello=async()=>{me.kp=await R.keyPair();me.key=null;ws.send(JSON.stringify({t:'hello',pub:me.kp.pub}));};
    ws.onopen=()=>hello();
    ws.onmessage=async e=>{if(view!==me)return;let m;try{m=JSON.parse(e.data);}catch{return;}
      if(m.t==='key'){try{me.key=await R.shared(me.kp.priv,m.pub);}catch{me.key=null;}}
      else if(m.t==='data'&&me.key){try{const snap=await R.open(me.key,m);if(view!==me)return;me.lastAt=snap.at;show(snap);viewState('rvConnected',{time:new Date(snap.at).toLocaleTimeString()});}catch{}}
      else if(m.t==='pubup'){clearView();viewState('rvWaiting');hello();}
      else if(m.t==='gone'||m.t==='end'){clearView();viewState(m.t==='end'?'rvEnded':'rvDisconnected');}};
    ws.onclose=()=>{if(view===me){clearView();viewState('rvDisconnected');}};}
  function closeView(){const me=view;view=null;renderSeq++;if(me)try{me.ws.close(1000,'close');}catch{}clearView();if($('reviewDialog').open)$('reviewDialog').close();}
  window.consentReviewClose=closeView;
  if($('reviewShareBtn'))$('reviewShareBtn').addEventListener('click',()=>pub?stopShare():startShare());
  if($('srvReviewBtn'))$('srvReviewBtn').addEventListener('click',openView);
  $('rvClose').addEventListener('click',closeView);$('reviewDialog').addEventListener('close',()=>{if(view)closeView();});
  document.addEventListener('languagechange-consent',()=>{shareUI();});
  // Only on the Worker origin (same probe as shared reservations).
  fetch('api/status',{credentials:'same-origin',cache:'no-store'}).then(r=>r.ok&&/json/.test(r.headers.get('Content-Type')||'')?r.json():null).then(j=>{if(j&&j.configured&&$('reviewShareBox'))$('reviewShareBox').hidden=false;}).catch(()=>{});
})();
