/* This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');require('../core.js');
const url='https://euroshop.boox.com/products/noteair6c?variant=53826690384235';Shelf.configureStores([{name:'Boox',url:'https://euroshop.boox.com',currency:'EUR'}]);
const selected={value:'53826690351467'},price={tagName:'SPAN',textContent:'€579.99',getAttribute:()=>null,getClientRects:()=>[{}],matches:()=>false,closest:()=>null};
const product=JSON.parse(fs.readFileSync(__dirname+'/fixtures/boox-variants.json','utf8'));
const document={title:'BOOX Note Air6 C',body:{innerText:''},querySelector:s=>s==='#product-selectors'?selected:null,querySelectorAll:s=>s==='#picked'?[price]:s==='script[type="application/ld+json"]'?[{textContent:JSON.stringify(product)}]:[]};
const ctx=vm.createContext({Shelf,URL,document,location:{href:url},getComputedStyle:()=>({display:'block',visibility:'visible'})});vm.runInContext(fs.readFileSync(__dirname+'/../reader.js','utf8'),ctx);const R=ctx.GameShelfReader;
assert.match(R.read('#picked').error,/requested Boox bundle/);assert.equal(R.read().status,'error');
selected.value='53826690384235';price.textContent='€656.99';let r=R.read('#picked');assert.equal(r.cents,65699);assert.equal(r.variantId,selected.value);
r=R.read();assert.equal(r.cents,65699);assert.equal(r.source,'Selected Boox bundle product data');
product.offers.find(o=>o.url===url).availability='https://schema.org/OutOfStock';assert.equal(R.read().status,'unavailable');
selected.value='53826690515307';assert.equal(R.read('#picked').status,'error','wrong warehouse variant is not accepted');
selected.value='';assert.equal(R.read('#picked').status,'error','bundle controls must be ready');
console.log('PASS Boox standard-versus-keyboard readiness, exact URL variant and warehouse, selected offer pricing, stock status and missing controls');
