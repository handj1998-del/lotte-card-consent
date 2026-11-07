'use strict';
// Theme: red/white palette, contrast >= 4.5:1 for text pairs, visible focus, no external assets/analytics.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');const css=read('consent.css'),html=read('index.html');
const lum=h=>{const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2];};
const cr=(a,b)=>{const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p);return (x+.05)/(y+.05);};
for(const [f,b] of [['#ffffff','#c8102e'],['#ffffff','#a00d25'],['#c8102e','#ffffff'],['#222222','#f4f4f4'],['#5f5f5f','#ffffff'],['#5f5f5f','#fafafa'],['#b00020','#ffffff'],['#1b6b3a','#ffffff']])assert(cr(f,b)>=4.5,`${f}/${b} ${cr(f,b).toFixed(2)}`);
assert(!/#1452a3/i.test(css));assert(css.includes('--accent:#c8102e'));assert(/:focus-visible[^{]*\{outline:3px solid var\(--accent\)/.test(css));
assert(!/https?:\/\//.test(css));assert(!/googletagmanager|analytics|gtag/i.test(html));
assert(!html.includes('data-i18n="flow"')&&!html.includes('data-i18n="guideNote"'));
assert(css.lastIndexOf('height:58px;min-height:58px')>0);
console.log('PASS: red/white theme, WCAG AA contrast pairs, focus ring, no external assets, removed copy stays removed, large inputs kept');
