/* This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');require('../core.js');
const url='https://www.amazon.ie/dp/B0GHSYQHP6';let elements={},scripts=[];
const node=(textContent,shown=true)=>({textContent,getAttribute:()=>null,closest:()=>null,getClientRects:()=>shown?[{}]:[]});
const document={title:'Life is Strange Reunion',body:{innerText:''},querySelector:s=>s.split(',').map(q=>elements[q]?.[0]).find(Boolean)||null,querySelectorAll:s=>s==='script[type="application/ld+json"]'?scripts.map(d=>node(JSON.stringify(d))):elements[s]||[]};
const ctx=vm.createContext({Shelf,URL,document,location:{href:url},getComputedStyle:()=>({display:'block',visibility:'visible'})});
vm.runInContext(fs.readFileSync(__dirname+'/../reader.js','utf8'),ctx);const R=ctx.GameShelfReader;
for(const selector of ['#availability','#availabilityInsideBuyBox_feature_div','#outOfStock','#unavailability_feature_div']){
 elements={[selector]:[node("We don't know when or if this item will be back in stock.")]};
 assert.equal(R.read().status,'unavailable');assert.equal(R.read('#old-price').unavailableReason,'out-of-stock');
}
elements={'#availability':[node('Currently unavailable',false)]};assert.equal(R.read().status,'error');
elements={};document.body.innerText='Recommended game: out of stock';assert.equal(R.read().status,'error');
elements={'#rightCol .a-button-text':[node('See All Buying Options')]};assert.equal(R.read().unavailableReason,'no-featured-offer');assert.equal(R.read('#old-price').unavailableReason,'no-featured-offer');
const l={};Shelf.stockChange(l,R.read(),1000);assert.equal(l.stockState,undefined);assert.equal(l.outOfStockSince,undefined);
elements={'#availability':[node('Currently unavailable')]};Shelf.stockChange(l,R.read(),1000);assert.equal(l.outOfStockSince,1000);
elements={'#rightCol .a-button-text':[node('See All Buying Options')]};Shelf.stockChange(l,R.read(),2000);assert.equal(l.outOfStockSince,1000);
elements={'#rightCol .a-button-text':[node('See All Buying Options')],'#newBuyBoxPrice':[node('€59.99')]};assert.equal(R.read().cents,5999);
elements={'#availability':[node('Currently unavailable')],'#ASIN':[{value:'B0OTHER123'}]};assert.equal(R.read().status,'error');
elements={'#availability':[node('Currently unavailable')],'#challenge-running':[node('')]};assert.equal(R.read().status,'blocked');
Shelf.configureStores([{name:'Example',url:'https://example.com',currency:'EUR'}]);
elements={};scripts=[{'@type':'Product',url:'https://example.com/game',offers:{'@type':'Offer',availability:'https://schema.org/OutOfStock'}}];
assert.equal(R.read('','https://example.com/game').status,'unavailable');
scripts[0].offers.availability='https://schema.org/InStock';assert.equal(R.read('','https://example.com/game').status,'error');
const manual={store:'amazonIE',currency:'EUR',cents:999};Shelf.record(manual,{status:'ok',currency:'EUR',cents:5999,availability:'OutOfStock'},3000);assert.equal(manual.status,'unavailable');assert.equal(manual.cents,999);
const state=Shelf.fresh();state.outOfStockAlerts=true;state.theme=Shelf.validTheme({outOfStock:'#abcdef'});const restored=Shelf.validateBackup(state);assert.equal(restored.outOfStockAlerts,true);assert.equal(restored.theme.outOfStock,'#abcdef');assert.equal(Shelf.validTheme({outOfStock:'invalid'}).outOfStock,'#55353d');
console.log('PASS scoped stock messages, hidden/recommendation guards, no-featured-offer distinction, variant/CAPTCHA priority, missing-price stock data and preference backups');
