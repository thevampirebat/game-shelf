/* This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. */
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');require('../core.js');
const base='https://www.shopto.net/en/xbxon03-onimusha-way-of-the-sword-xbox-series-x-p1203524/',eur=base+'eur/fr/';
let active='GBP (£)',links=[{textContent:'EUR (€)',getAttribute:()=>eur}];
const document={querySelectorAll:s=>s==='#currency_switch li.active a'?[{textContent:active}]:s==='#currency_switch a'?links:[]};
const ctx=vm.createContext({URL,document,location:{href:base}});vm.runInContext(fs.readFileSync(__dirname+'/../shopto.js','utf8'),ctx);const H=ctx.GameShelfShopTo;
assert.equal(H.currencyURL('EUR'),eur);assert.equal(H.currencyURL('GBP'),null);active='EUR (€)';assert.equal(H.currencyURL('EUR'),null);active='GBP (£)';
for(const bad of ['https://evil.example'+new URL(eur).pathname,eur.replace('p1203524','p99999'),eur.replace('/en/','/fr/'),eur.replace('/eur/','/usd/'),eur+'?variant=deluxe','javascript:alert(1)']){links=[{textContent:'EUR (€)',getAttribute:()=>bad}];assert.equal(H.currencyURL('EUR'),null,bad);}
links=[{textContent:'EUR (€)',getAttribute:()=>'/en/xbxon03-onimusha-way-of-the-sword-xbox-series-x-p1203524/eur/fr/'}];assert.equal(H.currencyURL('EUR'),eur);
assert(Shelf.sameListingURL(base,eur));assert(!Shelf.sameListingURL(base,eur.replace('p1203524','p888')));assert(!Shelf.sameListingURL(base,eur.replace('www.shopto.net','evil.example')));assert.equal(H.product('https://www.shopto.net/account/'),null);
// The reader rejects a GBP display even when a saved selector contains a plain amount.
Shelf.configureStores([{name:'ShopTo',url:'https://www.shopto.net',currency:'EUR'}]);
const price={textContent:'49.99',getAttribute:()=>null,getClientRects:()=>[{}],matches:()=>false,closest:()=>null};
const readerDoc={title:'Product',body:{innerText:''},querySelector:()=>null,querySelectorAll:s=>s==='#currency_switch li.active a'?[{textContent:'GBP (£)'}]:s==='#picked'?[price]:[]};
const rctx=vm.createContext({URL,Shelf,document:readerDoc,location:{href:base},getComputedStyle:()=>({display:'block',visibility:'visible'})});vm.runInContext(fs.readFileSync(__dirname+'/../reader.js','utf8'),rctx);assert.equal(rctx.GameShelfReader.read('#picked').status,'error');
readerDoc.querySelectorAll=s=>s==='#currency_switch li.active a'?[{textContent:'EUR (€)'}]:s==='#picked'?[price]:[];readerDoc.querySelector=s=>s==='meta[property="og:price:currency"]'?{getAttribute:()=> 'GBP'}:null;assert.equal(rctx.GameShelfReader.read('#picked').status,'error','mixed old GBP metadata cannot be accepted as EUR');
console.log('PASS observed ShopTo menu links, EUR selection, already-EUR no-op, same product/origin/language validation, relative links and GBP relabel guard');
