'use strict';
// No form values leave this page unless staff explicitly start 'PC 확인 공유' (review.js: encrypted, live only, never stored).
// No storage, network submission, or analytics.
const W=725,H=1024;
const fields=[],choices=[],signatures=[];
function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function position(el,x,y,w,h){Object.assign(el.style,{left:`${x/W*100}%`,top:`${y/H*100}%`,width:`${w/W*100}%`,height:`${h/H*100}%`});}
const fieldKeys={'예약번호':'reservation','임차인 이름':'renter','이메일':'email','전화번호':'phone','카드 종류 Debit / Credit':'cardType','카드사':'issuer','카드번호':'cardNumber','유효기간 MM/YYYY':'expiry','1쪽 서명 날짜':'date','확인 및 동의 이름':'renter','임차인 날짜':'date','추가 운전자 1 이름':'name','추가 운전자 1 날짜':'date','추가 운전자 2 이름':'name','추가 운전자 2 날짜':'date'};
function signatureKey(item){return item.label.startsWith('추가 운전자 1')?'driver1Sign':item.label.startsWith('추가 운전자 2')?'driver2Sign':'renterSign';}
function fieldGroup(label){if(label==='예약번호')return 'reservationFields';if(['임차인 이름','이메일','전화번호'].includes(label))return 'customerFields';if(['카드 종류 Debit / Credit','카드사','카드번호','유효기간 MM/YYYY'].includes(label))return 'cardFields';if(label==='1쪽 서명 날짜')return 'signerFields';if(label.startsWith('추가 운전자 1'))return 'extra1Fields';if(label.startsWith('추가 운전자 2'))return 'extra2Fields';return 'derivedFields';}
// Map legacy field coordinates (old scanned template) onto the vector template (source pages 3,2).
const MAP={1:[1.0683,-27.44,1.0840,-28.3],2:[1.07,-24.4,1.0812,-38.1]};function mapBox(page,x,y,w,h){const [a,b,c,d]=MAP[page];return [a*x+b,c*y+d,a*w,c*h];}
function field(page,label,x,y,w,h,type='text',value=''){
 [x,y,w,h]=mapBox(page,x,y,w,h);
 const el=document.createElement('input');el.type=type;el.value=value;el.className='entry-field';el.setAttribute('aria-label',t(fieldKeys[label]||'name'));el.autocomplete='off';el.spellcheck=false;el.maxLength=type==='date'?10:80;
 if(label==='카드번호'){el.inputMode='numeric';el.maxLength=23;}if(label==='유효기간 MM/YYYY'){el.placeholder='MM/YY';el.maxLength=5;el.inputMode='numeric';}
 const wrapper=document.createElement('label');wrapper.className='input-label';const caption=translatedNode(fieldKeys[label]||'name');wrapper.append(caption,el);document.getElementById(page===2&&label==='임차인 이름'?'derivedFields':fieldGroup(label)).append(wrapper);fields.push({page,label,x,y,w,h,el});return el;
}
field(1,'예약번호',192,225,169,17);field(1,'임차인 이름',192,244,169,16);field(1,'이메일',192,263,169,16,'email');{const phoneEl=field(1,'전화번호',192,284,169,45,'tel');const help=document.createElement('p');help.id='phoneHelp';help.className='phone-help';help.setAttribute('data-i18n','phoneHelp');help.textContent=t('phoneHelp');help.hidden=document.documentElement.lang==='ko';if(!help.hidden)phoneEl.setAttribute('aria-describedby','phoneHelp');phoneEl.after(help);}
const typeField=field(1,'카드 종류 Debit / Credit',492,207,171,16);const cardType=document.createElement('select');cardType.className='entry-field';cardType.style.cssText=typeField.style.cssText;cardType.setAttribute('aria-label','카드 종류 Debit / Credit');for(const value of ['', 'Debit','Credit']){const option=document.createElement('option');option.value=value;option.setAttribute('data-i18n',value==='Debit'?'debit':value==='Credit'?'credit':'select');option.textContent=t(option.getAttribute('data-i18n'));cardType.append(option);}typeField.replaceWith(cardType);fields.find(f=>f.el===typeField).el=cardType;
field(1,'카드사',492,225,171,17);field(1,'카드번호',492,244,171,34);field(1,'유효기간 MM/YYYY',492,286,171,40);field(1,'확인 및 동의 이름',84,791,192,20);field(1,'1쪽 서명 날짜',503,886,157,22,'date',today());
function signature(page,label,x,y,w,h){[x,y,w,h]=mapBox(page,x,y,w,h);const el=document.createElement('button');el.type='button';el.className='signature-entry';el.setAttribute('data-i18n','signButton');el.textContent=t('signButton');el.setAttribute('aria-label',label);const item={page,label,x,y,w,h,el,image:null};signatures.push(item);if(page===1)document.getElementById('renterSignature').append(el);else if(label.startsWith('추가 운전자 1'))document.getElementById('extra1Signature').append(el);else if(label.startsWith('추가 운전자 2'))document.getElementById('extra2Signature').append(el);el.onclick=()=>openSignature(item);}
signature(1,'1쪽 하단 서명',346,886,127,22);
// Preprinted source check marks are preserved, never collected as new customer choices.
const people=['임차인','추가 운전자 1','추가 운전자 2'];
for(let i=0;i<3;i++){const y=655+i*68;field(2,`${people[i]} 날짜`,467,y,96,20,'date',i===0?today():'');field(2,`${people[i]} 이름`,496,y+28,78,19);signature(2,`${people[i]} 서명`,583,y+(i===0?42:13),61,25);}
const dialog=document.getElementById('signDialog'),pad=document.getElementById('signCanvas'),ctx=pad.getContext('2d');let active=null,drawing=false,hasInk=false;
function openSignature(item){active=item;ctx.clearRect(0,0,pad.width,pad.height);hasInk=!!item.image;if(item.image)ctx.drawImage(item.image,0,0,pad.width,pad.height);document.getElementById('signTitle').textContent=t(signatureKey(item));dialog.showModal();}
function point(e){const r=pad.getBoundingClientRect();return [(e.clientX-r.left)*pad.width/r.width,(e.clientY-r.top)*pad.height/r.height];}
// Constant opaque black ink: 10 buffer pixels remains about 0.5pt in the smallest original PDF box.
pad.onpointerdown=e=>{e.preventDefault();pad.setPointerCapture(e.pointerId);drawing=true;hasInk=true;const [x,y]=point(e);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+.1,y+.1);ctx.lineWidth=10;ctx.lineCap='round';ctx.lineJoin='round';ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.strokeStyle='#000000';ctx.stroke();};
pad.onpointermove=e=>{if(!drawing)return;e.preventDefault();ctx.lineTo(...point(e));ctx.stroke();};pad.onpointerup=pad.onpointercancel=()=>{drawing=false;};
document.getElementById('erase').onclick=()=>{ctx.clearRect(0,0,pad.width,pad.height);hasInk=false;};document.getElementById('cancelSign').onclick=()=>dialog.close();
document.getElementById('applySign').onclick=async()=>{if(!hasInk){active.image=null;active.el.setAttribute('data-i18n','signButton');active.el.textContent=t('signButton');}else{const img=new Image();img.src=pad.toDataURL('image/png');await img.decode();active.image=img;active.el.removeAttribute('data-i18n');active.el.replaceChildren(img.cloneNode());}dialog.close();};
function syncRepeatedFields(){const get=label=>fields.find(f=>f.label===label).el;get('확인 및 동의 이름').value=get('임차인 이름').value;get('임차인 날짜').value=get('1쪽 서명 날짜').value;const nameFields=fields.filter(f=>f.label==='임차인 이름');nameFields.forEach(f=>f.el.value=nameFields[0].el.value);signatures[1].image=signatures[0].image;}
['input','change'].forEach(event=>document.getElementById('entry').addEventListener(event,syncRepeatedFields));
document.getElementById('clear').onclick=()=>{if(!confirm(t('resetConfirm')))return;fields.forEach(f=>f.el.value=f.el.type==='date'&&(['1쪽 서명 날짜','임차인 날짜'].includes(f.label))?today():'');choices.forEach(c=>c.el.checked=false);signatures.forEach(s=>{s.image=null;s.el.setAttribute('data-i18n','signButton');s.el.textContent=t('signButton');});setStatus('resetDone');};
function fitText(ctx,text,x,y,w,h){ctx.fillStyle='#111';let size=Math.min(12,h-3);do{ctx.font=`${size}px ConsentCJK, ConsentKorean, sans-serif`;if(ctx.measureText(text).width<=w-4)break;size-=.5;}while(size>5);ctx.textBaseline='middle';ctx.fillText(text,x+2,y+h/2,w-4);}
// First-open speed: the page PNGs, the canvas fonts and pdf-lib are fetched only when a document is actually drawn or saved.
// Each loader is shared (concurrent callers get one request) and forgets a failure so the next tap retries.
const PDF_LIB_SRC='vendor/pdf-lib.min.js?v=1.17.1',FONT_SRC={ConsentKorean:'assets/consent/NanumGothic-Regular.ttf?v=font-v1',ConsentCJK:'assets/consent/ConsentCJK.woff2?v=font-v1'};
function sharedRetry(fn){let p=null;return()=>p||(p=Promise.resolve().then(fn).catch(e=>{p=null;throw e;}));}
const loadPdfLib=sharedRetry(()=>window.PDFLib||new Promise((resolve,reject)=>{const s=document.createElement('script');let timer;const fail=()=>{clearTimeout(timer);s.remove();reject(Error('pdf-lib unavailable'));};
  s.src=PDF_LIB_SRC;s.async=true;s.onload=()=>{clearTimeout(timer);window.PDFLib?resolve(window.PDFLib):fail();};s.onerror=fail;timer=setTimeout(fail,60000);document.head.append(s);}));
// Canvas text must use the original fonts: wait for both faces; a failed face is re-added fresh so a later tap can retry.
async function ensureFace(family){if(!document.fonts)return;const ok=()=>[...document.fonts].some(f=>f.family.replace(/["']/g,'')===family&&f.status==='loaded');if(ok())return;
  try{await document.fonts.load(`12px ${family}`);}catch{}if(ok())return;if(typeof FontFace!=='function')throw Error('font '+family);const face=new FontFace(family,`url(${FONT_SRC[family]})`);document.fonts.add(face);await face.load();}
const loadDocFonts=sharedRetry(async()=>{await Promise.all([ensureFace('ConsentKorean'),ensureFace('ConsentCJK')]);if(document.fonts)await document.fonts.ready;});
function pageImage(page){const img=document.querySelector(`#page${page}>img`);if(!img.getAttribute('src'))img.src=img.dataset.src;return img.decode().then(()=>img,e=>{img.removeAttribute('src');throw e;});}
{const box=document.querySelector('.source-pages');const det=box&&box.closest('details');if(det)det.addEventListener('toggle',()=>{if(det.open)for(const p of [1,2])pageImage(p).catch(()=>{});});}
async function renderOverlay(page){
 await loadDocFonts();syncRepeatedFields();
 const canvas=document.createElement('canvas');canvas.width=2482;canvas.height=3508;const c=canvas.getContext('2d');c.scale(canvas.width/W,canvas.height/H);
 fields.filter(f=>f.page===page).forEach(f=>{if(!f.el.value)return;if(page===2&&f.el.type==='date'){const [year,month,day]=f.el.value.split('-');const X=v=>MAP[2][0]*v+MAP[2][1];fitText(c,year.slice(2),X(484),f.y,28,f.h);fitText(c,month,X(522),f.y,25,f.h);fitText(c,day,X(557),f.y,25,f.h);}else{const value=f.el.type==='date'?f.el.value.replaceAll('-','.'):f.el.value;fitText(c,value,f.x,f.y,f.w,f.h);}});
 signatures.filter(s=>s.page===page&&s.image).forEach(s=>{const ratio=Math.min(s.w/s.image.width,s.h/s.image.height);const w=s.image.width*ratio,h=s.image.height*ratio;c.drawImage(s.image,s.x+(s.w-w)/2,s.y+(s.h-h)/2,w,h);});return canvas;
}
async function renderPage(page){await loadDocFonts();const img=await pageImage(page);const canvas=document.createElement('canvas');canvas.width=2482;canvas.height=3508;const c=canvas.getContext('2d');c.drawImage(img,0,0,canvas.width,canvas.height);const overlay=await renderOverlay(page);c.drawImage(overlay,0,0);return canvas;}
async function makePDF(originalBytes,overlays){const pdf=await PDFLib.PDFDocument.load(originalBytes);if(pdf.getPageCount()!==2)throw Error('Expected original two-page template');for(let i=0;i<2;i++){const page=pdf.getPage(i),size=page.getSize(),ink=await pdf.embedPng(overlays[i]);page.drawImage(ink,{x:0,y:0,width:size.width,height:size.height});}return new Blob([await pdf.save()],{type:'application/pdf'});}
let downloadURL=null;
// Download only: no new window/tab, no navigation, so the browser saves instead of opening a viewer.
function saveBlob(blob,filename){if(downloadURL)URL.revokeObjectURL(downloadURL);const url=URL.createObjectURL(blob);downloadURL=url;const a=document.createElement('a');a.href=url;a.download=filename;a.rel='noopener';a.style.display='none';document.body.append(a);a.click();a.remove();setTimeout(()=>{if(downloadURL===url){URL.revokeObjectURL(url);downloadURL=null;}},60000);}
// One generation at a time (document view or download); every click renders fresh from the current form.
let docBusy=false;const docButtons=()=>['preview','save','savePreview','previewEntry'].map(id=>document.getElementById(id)).filter(Boolean);function setDocBusy(v){docBusy=v;docButtons().forEach(b=>b.disabled=v);}
function clearPreview(){const area=document.getElementById('previewPages');if(area){area.querySelectorAll('canvas').forEach(c=>{c.width=c.height=1;});area.replaceChildren();}}
// JPG export used by 동의완료: one low-quality image, <= 300,000 bytes. PDF export (savePDF) is used by 문서 보기.
const JPG_MAX=300000,JPG_WIDTHS=[1100,980,900,820,760,700,640,600,540],JPG_QUALITIES=[0.6,0.5,0.42,0.36];
// Both pages (page 1 = original page 3 on top, page 2 below) are rendered one at a time, reduced once to the largest width and released;
// then width/quality step down until the JPEG fits. Nothing fits -> error, no download.
async function makeJPG(encode=(c,q)=>new Promise(r=>c.toBlob(r,'image/jpeg',q))){const src=[],out=document.createElement('canvas'),ratio=3508/2482;
 try{for(let p=1;p<=2;p++){const full=await renderPage(p),s=document.createElement('canvas');s.width=JPG_WIDTHS[0];s.height=Math.round(JPG_WIDTHS[0]*ratio);const sc=s.getContext('2d');sc.imageSmoothingEnabled=true;sc.imageSmoothingQuality='high';sc.drawImage(full,0,0,s.width,s.height);full.width=full.height=1;src.push(s);}
  for(const w of JPG_WIDTHS){const h=Math.round(w*ratio);out.width=w;out.height=h*2;const c=out.getContext('2d');c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';c.fillStyle='#fff';c.fillRect(0,0,w,h*2);src.forEach((s,i)=>c.drawImage(s,0,i*h,w,h));
   for(const q of JPG_QUALITIES){const b=await encode(out,q);if(!b||b.type!=='image/jpeg')throw Error('jpeg');if(b.size<=JPG_MAX)return b;}}
  const e=Error('jpeg-size');e.code='size';throw e;}
 finally{src.forEach(s=>{s.width=s.height=1;});out.width=out.height=1;}}
async function savePDF(o={}){const status=document.getElementById('status'),btn=o.button;if(docBusy)return;setDocBusy(true);if(btn)btn.textContent=t('savingPdf');setStatus('loading');try{const lib=loadPdfLib();lib.catch(()=>{});await loadDocFonts();const originalResponse=await fetch('assets/consent/original.pdf',{cache:'no-cache'});if(!originalResponse.ok)throw Error('Original template unavailable');const originalBytes=await originalResponse.arrayBuffer();const overlays=[];for(let page=1;page<=2;page++){const canvas=await renderOverlay(page);const ink=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!ink)throw Error('image');overlays.push(new Uint8Array(await ink.arrayBuffer()));canvas.width=canvas.height=1;}await lib;const blob=await makePDF(originalBytes,overlays);saveBlob(blob,`consent-${today()}.pdf`);status.replaceChildren(translatedNode('downloadReady'));if(!o.keepShare&&window.consentReviewStop)window.consentReviewStop('rvDone'); }catch(e){setStatus('pdfError');}finally{setDocBusy(false);if(btn)btn.textContent=t(btn.getAttribute('data-i18n'));}}
async function saveJPG(o={}){const status=document.getElementById('status'),btn=o.button;if(docBusy)return;setDocBusy(true);if(btn)btn.textContent=t('savingJpg');setStatus('loadingJpg');try{const blob=await makeJPG();saveBlob(blob,`consent-${today()}.jpg`);status.replaceChildren(translatedNode('downloadReadyJpg'));if(window.consentReviewStop)window.consentReviewStop('rvDone');}catch(e){setStatus(e&&e.code==='size'?'jpgTooLarge':'pdfError');}finally{setDocBusy(false);if(btn)btn.textContent=t(btn.getAttribute('data-i18n'));}}
// 동의완료: validate, then save the low-quality JPG (<= 300,000 bytes) directly, no chooser/confirm; it ends PC sharing.
document.getElementById('save').onclick=async()=>{if(docBusy||!validate())return;await saveJPG({button:document.getElementById('save')});};

function luhnCheck(value){const digits=value.replace(/\D/g,'');if(digits.length<13||digits.length>19)return false;let sum=0,even=false;for(let i=digits.length-1;i>=0;i--){let n=Number(digits[i]);if(even){n*=2;if(n>9)n-=9;}sum+=n;even=!even;}return sum%10===0;}
function checkExpiry(value){const m=value.match(/^(0[1-9]|1[0-2])\/(\d{2})$/);if(!m)return false;const now=new Date();return new Date(2000+Number(m[2]),Number(m[1]),0)>=new Date(now.getFullYear(),now.getMonth(),1);}
const cardField=fields.find(f=>f.label==='카드번호').el,expiryField=fields.find(f=>f.label==='유효기간 MM/YYYY').el;
const cardStatus=document.createElement('p');cardStatus.id='cardFormatStatus';cardStatus.className='card-format-status';cardStatus.setAttribute('aria-live','polite');cardField.setAttribute('aria-describedby','cardFormatStatus');cardField.closest('label').after(cardStatus);
let cardBlurred=false;function cardState(value,final){const d=value.replace(/\D/g,'');if(!d)return 'empty';if(luhnCheck(d))return 'valid';if(d.length<13||(!final&&d.length<16))return final?'invalid':'incomplete';return 'invalid';}
function updateCardStatus(){const state=cardState(cardField.value,cardBlurred);cardStatus.dataset.state=state;cardStatus.textContent=state==='empty'?'':t({valid:'cardFormatValid',invalid:'cardFormatInvalid',incomplete:'cardFormatTyping'}[state])+(state==='empty'?'':' '+t('cardFormatNote'));cardField.setCustomValidity(state==='invalid'?t('cardInvalid'):'');}
cardField.addEventListener('input',()=>{const raw=cardField.value.replace(/\D/g,'').slice(0,19);cardField.value=raw.replace(/(.{4})/g,'$1 ').trim();if(!raw)cardBlurred=false;updateCardStatus();});cardField.addEventListener('blur',()=>{cardBlurred=!!cardField.value;updateCardStatus();});
expiryField.addEventListener('input',()=>{let raw=expiryField.value.replace(/\D/g,'').slice(0,4);if(/^[2-9]$/.test(raw))raw='0'+raw;expiryField.value=raw.length>2?raw.slice(0,2)+'/'+raw.slice(2):raw;expiryField.setCustomValidity(raw&&!checkExpiry(expiryField.value)?t('expiryInvalid'):'');});
function validate(){const name=fields.find(f=>f.label==='임차인 이름').el;if(!name.value.trim()){alert(t('nameRequired'));name.focus();return false;}if(cardField.value&&!luhnCheck(cardField.value)){alert(t('cardInvalid'));cardField.focus();return false;}if(expiryField.value&&!checkExpiry(expiryField.value)){alert(t('expiryInvalid'));expiryField.focus();return false;}return true;}
document.getElementById('refresh').onclick=()=>{if(confirm(t('refreshConfirm')))location.reload();};
document.getElementById('backPreview').onclick=()=>document.getElementById('previewDialog').close();
document.getElementById('closePreview').onclick=()=>document.getElementById('previewDialog').close();
document.getElementById('previewDialog').addEventListener('close',clearPreview);
document.getElementById('savePreview').onclick=()=>{document.getElementById('previewDialog').close();document.getElementById('save').click();document.getElementById('status').scrollIntoView({block:'center',behavior:'smooth'});};
// 문서 보기 (header + form): download the current document as the same 2-page PDF directly, no popup or chooser. Same validation as
// before; it is not completion, so PC review sharing keeps running. The old in-page view dialog is no longer opened.
for(const id of ['preview','previewEntry'])document.getElementById(id).onclick=async()=>{if(docBusy||!validate())return;await savePDF({keepShare:true,button:document.getElementById(id)});};

function updateTranslatedControls(){fields.forEach(f=>f.el.setAttribute('aria-label',t(fieldKeys[f.label]||'name')));signatures.forEach(s=>s.el.setAttribute('aria-label',t(signatureKey(s))));if(active)document.getElementById('signTitle').textContent=t(signatureKey(active));if(typeof updateCardStatus==='function')updateCardStatus();const ph=document.getElementById('phoneHelp');if(ph){const ko=document.documentElement.lang==='ko';ph.hidden=ko;const pe=ph.previousElementSibling;if(pe)ko?pe.removeAttribute('aria-describedby'):pe.setAttribute('aria-describedby','phoneHelp');}expiryField.setCustomValidity(expiryField.value&&!checkExpiry(expiryField.value)?t('expiryInvalid'):'');}
setLanguage('ko');
