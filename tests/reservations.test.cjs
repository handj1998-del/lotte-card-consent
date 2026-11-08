'use strict';
// Local reservation vault: AES-GCM + PBKDF2, PIN never stored, only 4 reservation fields persisted. Synthetic data only.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const store=new Map();globalThis.localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
const {ReservationVault:V}=require(path.join(root,'reservations.js'));
const PIN='13579',OTHER='24680';// synthetic test PINs (not the user's)
(async()=>{
assert.equal(V.exists(),false);
const s=await V.setup(PIN);assert(V.exists());await assert.rejects(V.setup(PIN),/exists/);
const rec=V.clean({no:'TEST-RES-0001',name:'TEST USER',phone:'+1 555 0100',email:'test.user@example.invalid',card:'4111111111111111',expiry:'12/30',signature:'data:x'});
assert.deepEqual(Object.keys(rec).sort(),['created','email','id','name','no','phone','updated']);
s.records.push(rec,V.clean({no:'TEST-RES-0002',name:'홍길동',phone:'',email:''}));await V.save(s);
const blob=store.get(V.KEY);const o=JSON.parse(blob);
for(const plain of ['TEST-RES-0001','TEST USER','555 0100','example.invalid','홍길동',PIN,'4111'])assert(!blob.includes(plain),'no plaintext: '+plain);
assert.deepEqual(Object.keys(o).sort(),['ct','iter','iv','salt','v']);assert(o.iter>=600000);assert.equal(Buffer.from(o.salt,'base64').length,16);assert.equal(Buffer.from(o.iv,'base64').length,12);
const iv1=o.iv;await V.save(s);assert.notEqual(JSON.parse(store.get(V.KEY)).iv,iv1,'fresh IV per save');
await assert.rejects(V.unlock(OTHER),/badpin/);
const u=await V.unlock(PIN);assert.equal(u.records.length,2);assert.equal(u.records[0].name,'TEST USER');
// edit + delete
u.records[1]=V.clean({...u.records[1],phone:'+82 10 0000 0000'});u.records=u.records.filter(r=>r.no!=='TEST-RES-0001');await V.save(u);
const u2=await V.unlock(PIN);assert.equal(u2.records.length,1);assert.equal(u2.records[0].phone,'+82 10 0000 0000');
// change PIN re-encrypts with new salt
const saltBefore=JSON.parse(store.get(V.KEY)).salt;await V.changePin(u2,OTHER);assert.notEqual(JSON.parse(store.get(V.KEY)).salt,saltBefore);
await assert.rejects(V.unlock(PIN),/badpin/);assert.equal((await V.unlock(OTHER)).records.length,1);
// masking
assert.equal(V.maskNo('TEST-RES-0001'),'TE••••••••001');assert.equal(V.maskName('TEST USER'),'T•••••••R');assert.equal(V.maskName('홍길동'),'홍•동');assert.equal(V.maskName('김나'),'김•');
// static flow/privacy checks
const js=read('reservations.js'),html=read('index.html'),cj=read('consent.js');
assert(!/fetch\(|XMLHttpRequest|sendBeacon|sessionStorage|indexedDB|console\.|location\.(hash|search|href)\s*=/.test(js));
assert(!/\b8\d{3}\b/.test(js+html+cj),'no hardcoded 4-digit PIN-like constant');
assert(!/localStorage|sessionStorage|indexedDB/.test(cj+read('guide.js')),'form/card/signature never persisted');
assert(/function startCustomer\(r\)\{if\(sameCustomer\(r\)\)\{resumeDraft\(\);return true;\}if\(formDirty\(\)&&!confirm\(t\('resClearConfirm'\)\)\)/.test(js),'confirm before clearing another customer');
assert(/clearCustomerForm\(\);if\(r\)fill\(r\);lock\(\);/.test(js),'clear -> fill -> lock on handoff');
assert(/function remove\(id\)\{if\(!confirm\(t\('resDeleteConfirm'\)\)\)return;/.test(js),'delete confirm');
assert(js.includes("window.addEventListener('pagehide',lockLocal)")&&js.includes('document.hidden)lockLocal()')&&/IDLE_MS=\d+/.test(js));
assert(/\$\('resList'\)\.replaceChildren\(\)/.test(js.match(/function lock\(\)\{.*?\}/s)[0]),'lock wipes decrypted list DOM');
assert(js.includes("set('예약번호',r.no);set('임차인 이름',r.name);set('전화번호',r.phone);set('이메일',r.email)"));
for(const id of ['resPin','resNewPin','resNewPin2','resCurPin','resChPin','resChPin2'])assert(new RegExp(`id="${id}"[^>]*type="password"`).test(html),id);
assert(/id="resList"/.test(html)&&!/<li/.test(html.match(/<ul id="resList"[^>]*>(.*?)<\/ul>/s)[1]),'no records in static DOM');
assert(html.indexOf('id="resScreen"')<html.indexOf('id="guidancePanel"'));assert(read('guide.js').includes("show(res?'reserve':'guide')"));
const src=read('i18n.js');const st=src.indexOf('const translations=')+19;const d=JSON.parse(src.slice(st,src.indexOf(';\nlet currentLanguage',st)));
for(const l of Object.keys(d))for(const k of ['resTitle','resNoBooking','resStorageNote','resDeleteConfirm','resClearConfirm','resBadPin'])assert(d[l][k],l+k);
console.log('PASS: vault roundtrip, wrong PIN fails, random IV/salt, PBKDF2>=600k, no plaintext/PIN/card/signature stored, edit/delete/change PIN, masking, handoff lock/clear/confirm, refresh/pagehide lock, field mapping, 5 languages');
})().catch(e=>{console.error(e.message);process.exit(1);});
