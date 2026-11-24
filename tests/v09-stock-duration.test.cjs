/* This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. */
const assert=require('node:assert/strict');require('../core.js');
const at=1700000000000,l={};
assert.equal(Shelf.stockChange(l,{status:'unavailable'},at),false);
assert.equal(l.outOfStockSince,at);
Shelf.stockChange(l,{status:'unavailable'},at+86400000);assert.equal(l.outOfStockSince,at);
for(const reading of [{status:'error'},{status:'blocked'},{status:'ok',availability:'Unknown'}]){
 Shelf.stockChange(l,reading,at+172800000);assert.equal(l.outOfStockSince,at);assert.equal(l.stockState,'out');
}
assert.equal(Shelf.stockDuration(at,at+30000),'less than a minute');
assert.equal(Shelf.stockDuration(at,at+60000),'1 minute');
assert.equal(Shelf.stockDuration(at,at+7200000),'2 hours');
assert.equal(Shelf.stockDuration(at,at+172800000),'2 days');
assert.equal(Shelf.stockDuration(at+1,at),'');assert.equal(Shelf.stockDuration(NaN,at),'');
assert(Shelf.stockChange(l,{status:'ok',availability:'InStock'},at+172800000));assert.equal(l.outOfStockSince,undefined);
Shelf.stockChange(l,{status:'ok',availability:'https://schema.org/OutOfStock'},at+180000000);
// The reader supplies plain availability tokens; URL-shaped unknowns do not confirm a state.
assert.equal(l.stockState,'in');
Shelf.stockChange(l,{status:'ok',availability:'OutOfStock'},at+180000000);assert.equal(l.outOfStockSince,at+180000000);
const legacy={stockState:'out'};Shelf.stockChange(legacy,{status:'blocked'},at);assert.equal(legacy.outOfStockSince,undefined);
Shelf.stockChange(legacy,{status:'unavailable'},at);assert.equal(legacy.outOfStockSince,at);
const state=Shelf.fresh();state.hiddenStores=[];state.games=[{name:'Test',listings:[{...l,id:'a',url:'https://www.amazon.ie/dp/B0TEST1234',store:'amazonIE',currency:'EUR',status:'unavailable'}]}];
const restored=Shelf.validateBackup(state).games[0].listings[0];assert.equal(restored.stockState,'out');assert.equal(restored.outOfStockSince,l.outOfStockSince);assert.equal(restored.status,'pending');
Shelf.stockChange(restored,{status:'unavailable'},Date.now());assert.equal(restored.outOfStockSince,l.outOfStockSince);
state.games[0].listings[0].outOfStockSince=Date.now()+86400000;assert.equal(Shelf.validateBackup(state).games[0].listings[0].outOfStockSince,undefined);
Shelf.migrate(state,at);assert.equal(state.games[0].listings[0].outOfStockSince,undefined);
console.log('PASS observed stock duration, confirmation transitions, failed checks, legacy listings and backup validation');
