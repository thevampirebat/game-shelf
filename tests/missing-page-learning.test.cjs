/* This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');require('../core.js');
Shelf.configureStores([{name:'Example',url:'https://example.com',currency:'EUR'}]);
const url='https://example.com/products/game',price={tagName:'SPAN',textContent:'€19.99',classList:[],getAttribute:()=>null,getClientRects:()=>[{}],closest:()=>null};
const parent={tagName:'DIV',classList:['product-price'],getAttribute:()=>null};price.parentElement=parent;
let ambiguous=false,heading='',blocked=false,metadata=[];
const document={title:'Game product',body:{innerText:''},querySelector:s=>blocked&&s.includes('#challenge-running')?{}:null,querySelectorAll:s=>s==='h1,[role="heading"][aria-level="1"]'&&heading?[{...price,textContent:heading}]:s==='div.product-price span'?(ambiguous?[price,{...price}]:[price]):s==='#picked'?[price]:s==='script[type="application/ld+json"]'?metadata.map(p=>({textContent:JSON.stringify(p)})):[]};
const ctx=vm.createContext({Shelf,URL,document,location:{href:url},getComputedStyle:()=>({display:'block',visibility:'visible'})});vm.runInContext(fs.readFileSync(__dirname+'/../reader.js','utf8'),ctx);const R=ctx.GameShelfReader;
for(const title of ['404','404 - Page Not Found','Page not found | Example','Product not found','Error 404']){document.title=title;const r=R.read();assert.equal(r.errorReason,'not-found',title);assert.equal(r.terminal,true);}
document.title='Game';heading='Sorry, we couldn’t find this page';assert.equal(R.read().errorReason,'not-found');heading='';
document.title='Error 404';assert.equal(R.read('','https://www.amazon.ie/not-found').errorReason,'not-found','missing-page detection precedes product URL parsing');blocked=true;assert.equal(R.read().status,'blocked');blocked=false;
document.title='Game 404: Adventure';document.body.innerText='Recommended help: page not found';assert.equal(R.read().errorReason,undefined,'product and recommendation text are not 404 evidence');
const chosen=R.read('#picked');assert.equal(chosen.cents,1999);assert.equal(chosen.learnedSelector,'div.product-price span','plain child spans learn their semantic ancestor');
const rule={origin:'https://example.com',store:Shelf.identify(url).id,currency:'EUR',selector:chosen.learnedSelector};assert.equal(Shelf.validPriceRules([rule]).length,1);
assert.equal(R.read('','https://example.com/products/another','EUR',[rule]).cents,1999);
assert.equal(R.read('#moved',url,'EUR',[rule]).source,'Learned store price layout');
metadata=[{'@type':'Product',url,offers:{price:'29.99',priceCurrency:'EUR',availability:'https://schema.org/InStock'}}];assert.equal(R.read('',url,'EUR',[rule]).cents,1999,'learned visible price precedes generic metadata');
metadata[0].offers.availability='https://schema.org/OutOfStock';assert.equal(R.read('',url,'EUR',[rule]).status,'unavailable','explicit out-of-stock data still takes priority');metadata=[];
ambiguous=true;assert.equal(R.read('',url,'EUR',[rule]).status,'error');assert.equal(R.learnSelector(price,'EUR'),'');
const l={store:Shelf.identify(url).id,currency:'EUR',cents:999};Shelf.record(l,{status:'error',errorReason:'not-found',error:'404'});assert.equal(l.cents,999);assert.equal(l.errorReason,'not-found');Shelf.record(l,{status:'ok',currency:'EUR',cents:1999});assert.equal(l.errorReason,'');
console.log('PASS terminal missing-page evidence/false-positive guards, semantic parent learning, second product, moved-selector recovery, metadata/stock priority and retained prices');
