/* This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');require('../core.js');
const url='https://www.shop-justforgames.eu/products/blades-of-fire-day-one-edition-xbox-series-x';
Shelf.configureStores([{name:'Just for Games',url,currency:'EUR'}]);
let scriptData=[],matches=[];
const price={tagName:'SALE-PRICE',textContent:'Sale price59,99€',classList:['text-lg'],parentElement:null,getAttribute:()=>null,getClientRects:()=>[{}],closest:s=>s==='sale-price'?price:null,matches:s=>s==='sale-price'};
const document={title:'Blades of Fire',body:{innerText:'Sale price59,99€'},querySelector:()=>null,querySelectorAll:s=>s==='script[type="application/ld+json"]'?scriptData.map(d=>({textContent:JSON.stringify(d)})):['#picked','.product-info__price sale-price'].includes(s)?[price]:s==='sale-price.text-lg'?matches:[]};
const ctx=vm.createContext({Shelf,URL,CSS:{escape:s=>s},document,location:{href:url},getComputedStyle:()=>({display:'block',visibility:'visible'})});
vm.runInContext(fs.readFileSync(__dirname+'/../reader.js','utf8'),ctx);const R=ctx.GameShelfReader;
assert.equal(R.priceText('59,99€','EUR'),5999);assert.equal(R.read('#picked').cents,5999);assert.equal(R.read().cents,5999);
const child={closest:s=>s==='sale-price'?price:null};assert.equal(R.pickTarget(child),price);
price.textContent='Sale price59,99€ 69,99€';assert.equal(R.read('#picked').status,'error');price.textContent='Sale price59,99€';
matches=[price];const selector=R.learnSelector(price,'EUR');assert.equal(selector,'sale-price.text-lg');
const rule={origin:new URL(url).origin,store:Shelf.identify(url).id,currency:'EUR',selector};
// A second product uses the learned layout, with no built-in main-product slot or structured data.
document.querySelectorAll=s=>s===selector?matches:[];
const second=new URL('/products/another-game',url).href;
assert.equal(R.read('',second,'EUR',[rule]).source,'Learned store price layout');
assert.equal(R.read('',second,'GBP',[rule]).status,'error');
Shelf.configureStores([{name:'Just for Games',url,currency:'EUR'},{name:'Other',url:'https://other.example',currency:'EUR'}]);
assert.equal(R.read('','https://other.example/products/another-game','EUR',[rule]).status,'error');
matches=[price,{...price}];assert.equal(R.read('',second,'EUR',[rule]).status,'error');assert.equal(R.learnSelector(price,'EUR'),'');
matches=[price];price.textContent='59,99€ 69,99€';assert.equal(R.read('',second,'EUR',[rule]).status,'error');price.textContent='59,99€';
const state=Shelf.fresh();state.sitePriceRules=[rule];state.learnPrices=false;
const restored=Shelf.validateBackup(state);assert.equal(restored.sitePriceRules[0].selector,selector);assert.equal(restored.learnPrices,false);
assert.equal(Shelf.validPriceRules([{...rule,origin:'http://example.com'},{...rule,selector:'script:has(*)'},{...rule,currency:'XXX'}]).length,0);
// Actual current page's two Product blocks: canonical EU URL and SEO plugin's COM URL.
const fixture=JSON.parse(fs.readFileSync(__dirname+'/fixtures/justforgames-product.json','utf8'));
scriptData=fixture;document.querySelectorAll=s=>s==='script[type="application/ld+json"]'?scriptData.map(d=>({textContent:JSON.stringify(d)})):[];
assert.equal(R.read().cents,5999);assert.equal(R.read().availability,'InStock');
scriptData=[{...fixture[0],offers:{...fixture[0].offers,availability:'https://schema.org/OutOfStock'}}];assert.equal(R.read().status,'unavailable');
console.log('PASS live-page product identity, sale-label comma prices, learned second product, wrong origin/currency, ambiguity, backup and invalid rule guards');
