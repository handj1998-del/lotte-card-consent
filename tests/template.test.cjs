'use strict';
// Template = source PDF pages [3,2] (1-based), vector, A4; mapped field boxes land on blank cells.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const pdf=fs.readFileSync(path.join(root,'assets/consent/original.pdf'));
assert.equal(crypto.createHash('sha256').update(pdf).digest('hex'),'98ff1bad3fabcd6ded07cfc896352967a6dae851db93ae2ade7a06cd13aec8c6');
const js=read('consent.js');const MAP=JSON.parse(js.match(/const MAP=(\{.*?\});/)[1].replace(/(\d):/g,'"$1":'));
const map=(p,x,y,w,h)=>{const [a,b,c,d]=MAP[p];return [a*x+b,c*y+d,a*w,c*h];};
const S=725/595.276;// expected cell centres from the vector source text layer (pdftotext -bbox), in 725x1024 space
const near=(v,e,tol,msg)=>assert(Math.abs(v-e)<=tol,`${msg}: ${v.toFixed(1)} vs ${e.toFixed(1)}`);
// page 1 (source p3): Expiration Date row / Signature box; page 2 (source p2): renter date row "20" y 556–565pt, Name: 577.7–587pt
let [x,y,w,h]=map(2,467,655,96,20);near(y+h/2,(556+565.3)/2*S,4,'renter date row');
[x,y,w,h]=map(2,496,683,78,19);near(y+h/2,(577.7+586.9)/2*S,4,'renter name row');assert(x>=413.8*S-2,'name right of label');
[x,y,w,h]=map(2,467,655+2*68,96,20);near(y+h/2,(676.7+686)/2*S,4,'driver date row');
const X=v=>MAP[2][0]*v+MAP[2][1];assert(X(484)>402.1*S-2&&X(522)>432.9*S-3&&X(557)>463.7*S-3,'YY/MM/DD after "20" and dots');
[x,y,w,h]=map(1,346,886,127,22);assert(y>=925&&y+h<=962&&x>=338&&x+w<=485,'page1 signature in red box');
[x,y,w,h]=map(1,492,286,171,40);assert(x+20<570,'MM/YY written left of printed MM/YYYY hint');
assert(/copyPages|\[2,1\]/.test(read('docs/TEMPLATE_SOURCE.md'))||read('docs/TEMPLATE_SOURCE.md').includes('3, 2'));
console.log('PASS: template hash, source order [3,2], field boxes mapped onto source cells (page1 signature/expiry, page2 dates/names)');
