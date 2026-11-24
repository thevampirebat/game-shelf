/* This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. */
const assert=require('node:assert/strict');require('../core.js');
const s=Shelf.fresh();s.hiddenStores=[];const url='https://www.amazon.ie/dp/B0TEST1234';
s.games=[{name:'Test',listings:[{id:'old',url,store:'amazonIE',currency:'EUR',cents:1000,status:'ok'}]}];
s.lastSummary={at:Date.now(),partial:true,items:[{title:'Price dropped',message:'EUR 12 to EUR 10',listingId:'old',url,cents:1000,currency:'EUR'},{title:'Out of stock',message:'Store unavailable'}]};
const restored=Shelf.validateBackup(JSON.parse(JSON.stringify(s))),item=restored.lastSummary.items[0];
assert.equal(restored.lastSummary.at,s.lastSummary.at);assert.equal(restored.lastSummary.partial,true);assert.equal(restored.lastSummary.items.length,2);assert.equal(item.listingId,restored.games[0].listings[0].id);assert.notEqual(item.listingId,'old');assert.equal(restored.lastSummary.items[1].message,'Store unavailable');
assert(!Shelf.isLowestEntry(restored,item),'Imported prices await check');restored.games[0].listings[0].status='ok';restored.games[0].listings[0].checkedAt=Date.now();assert(Shelf.isLowestEntry(restored,item));
const twice=Shelf.validateBackup(restored);assert.equal(twice.lastSummary.items[0].listingId,twice.games[0].listings[0].id);
s.lastSummary.items.push({title:'Bad URL',message:'Readable',url:'javascript:alert(1)',cents:1,currency:'EUR'},null,{title:4,message:'bad'});
const safe=Shelf.validateBackup(s);assert.equal(safe.lastSummary.items.length,3);assert.equal(safe.lastSummary.items[2].url,undefined);
s.lastSummary.at=Date.now()+86400000;assert.equal(Shelf.validateBackup(s).lastSummary,undefined);delete s.lastSummary;assert.equal(Shelf.validateBackup(s).lastSummary,undefined);
console.log('PASS summary backup/import dates, text, partial flag, remapped listing IDs, recheck highlights, unsafe metadata and old backups');
