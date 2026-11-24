/*
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at https://mozilla.org/MPL/2.0/.
*/
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
require('../core.js');
const url='https://www.shopto.net/en/xbxon03-onimusha-way-of-the-sword-xbox-series-x-p1203524/eur/fr/';
const store=Shelf.customStore({name:'ShopTo',url:'https://www.shopto.net',currency:'EUR'});Shelf.configureStores([store]);
let offer=JSON.parse(fs.readFileSync(__dirname+'/fixtures/shopto-image-offer.json','utf8'));
let formProductId='1203524';const form={querySelector:()=>({value:formProductId})};
const box={textContent:'',tagName:'DIV',getAttribute:()=>null,getClientRects:()=>[{}],matches:s=>s==='.itemcard_order_button_cust_price_wrapper.base_price',closest:s=>s==='.itemcard_order_button_cust_price_wrapper.base_price'?box:s==='form'?form:null};
const img={textContent:'',parentElement:box,closest:s=>box.closest(s),matches:()=>false};
const document={title:'Onimusha',body:{innerText:''},querySelector:()=>null,querySelectorAll:s=>s==='#picked'?[box]:s==='script[type="application/ld+json"]'?[{textContent:JSON.stringify(offer)}]:[]};
const ctx=vm.createContext({Shelf,document,location:{href:url,hostname:'www.shopto.net'},URL,getComputedStyle:()=>({display:'block',visibility:'visible'})});vm.runInContext(fs.readFileSync(__dirname+'/../reader.js','utf8'),ctx);
const R=ctx.GameShelfReader;
assert.equal(R.priceText('59,78 €','EUR'),5978);assert.equal(R.priceText('1.259,78 €','EUR'),125978);assert.equal(R.priceText('59,78 € 19,92 €','EUR'),null);
assert.equal(R.pickTarget(img),box);let result=R.read('#picked');assert.equal(result.status,'ok');assert.equal(result.cents,5978);assert.equal(result.availability,'OutOfStock');
assert.equal(R.read('').status,'unavailable','automatic stock checks retain unavailable state');
formProductId='99999';assert.equal(R.read('#picked').status,'error','recommendation image cannot use main product data');formProductId='1203524';
offer.offers.price='49,50';assert.equal(R.read('#picked').cents,4950,'fresh page data, never fixed screenshot amount');
offer.offers.priceCurrency='GBP';assert.equal(R.read('#picked').status,'error');offer.offers.priceCurrency='EUR';
offer.offers.url='https://www.shopto.net/en/another-product/';assert.equal(R.read('#picked').status,'error','unrelated offer rejected');offer.offers.url=url;
offer.offers=[offer.offers,{...offer.offers,price:'99.99'}];assert.equal(R.read('#picked').status,'error','conflicting offers rejected');
console.log('PASS ShopTo image picking, comma decimals, live-matched offer identity/currency/availability and ambiguity guards');
