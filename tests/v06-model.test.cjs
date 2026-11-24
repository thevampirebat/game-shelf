/*
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at https://mozilla.org/MPL/2.0/.
*/
const assert=require('node:assert/strict');require('../core.js');
const s=Shelf.fresh();s.hiddenStores=[];s.notificationMode='summary';s.stockAlerts=true;s.retryFailed=true;s.compareDelivered=true;
const a={id:'a',url:'https://www.amazon.ie/dp/B0TEST1234',store:'amazonIE',currency:'EUR',cents:1000,shippingCents:500,shippingCurrency:'EUR',details:'Series X · New',status:'ok',checkedAt:Date.now(),history:[{at:1,cents:1200,currency:'EUR'},{at:2,cents:1000,currency:'EUR'},{at:3,cents:900,currency:'GBP'}]};
const b={...a,id:'b',url:'https://www.amazon.ie/dp/B0TEST5678',cents:1300,shippingCents:0},unknown={...a,id:'c',cents:1,shippingCents:null};
assert.equal(Shelf.delivered(a),1500);assert.equal(Shelf.delivered({...a,currency:'GBP'}),null);
assert.deepEqual(Shelf.lowest([a,b,unknown],s),['b']);s.compareDelivered=false;assert.deepEqual(Shelf.lowest([a,b,unknown],s),['c']);
s.games=[{name:'Test',paused:true,platform:'Xbox',listings:[a]}];
assert.equal(Shelf.scanListings(s).length,0);assert.equal(Shelf.scanListings(s,{listingId:'a'}).length,0);
const restored=Shelf.validateBackup(s);assert.equal(restored.games[0].paused,true);assert.equal(restored.games[0].listings[0].shippingCents,500);assert.equal(restored.games[0].listings[0].details,a.details);assert.equal(restored.notificationMode,'summary');assert(restored.stockAlerts&&restored.retryFailed);
assert.deepEqual(Shelf.historySeries(a).map(s=>s.points.length),[2,1]);
assert.match(Shelf.variantWarning('Test PS5',{name:'Test',platform:'Xbox'}),/Platform/);
assert.match(Shelf.variantWarning('Test Deluxe Xbox',{name:'Test',platform:'Xbox'}),/Edition/);
const stock={};assert(!Shelf.stockChange(stock,{status:'ok',availability:'InStock'}));assert(!Shelf.stockChange(stock,{status:'unavailable'}));assert(!Shelf.stockChange(stock,{status:'error'}));assert(!Shelf.stockChange(stock,{status:'ok',availability:'Unknown'}));assert(Shelf.stockChange(stock,{status:'ok',availability:'In stock.'}));assert(!Shelf.stockChange(stock,{status:'ok',availability:'InStock'}));
console.log('PASS delivered comparison excludes unknown shipping, mixed currencies stay separate, backup settings/details/pause retention, variant warnings and stock transitions');
