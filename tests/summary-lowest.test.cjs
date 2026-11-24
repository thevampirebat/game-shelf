/*
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at https://mozilla.org/MPL/2.0/.
*/
const assert=require('node:assert/strict');require('../core.js');
const now=Date.now(),a={id:'a',url:'https://example.com/a',store:'one',cents:1000,currency:'EUR',status:'ok',checkedAt:now},b={id:'b',url:'https://example.com/b',store:'two',cents:1200,currency:'EUR',status:'ok',checkedAt:now};
const state={baseCurrency:'EUR',games:[{id:'g',listings:[a,b]}],hiddenStores:[],exchangeRates:{},manualRates:{}};
const entry={listingId:'a',url:a.url,cents:1000,currency:'EUR'};
assert(Shelf.isLowestEntry(state,entry,now));assert(Shelf.isLowestEntry(state,{url:a.url,price:1000,currency:'EUR'},now));
assert(!Shelf.isLowestEntry(state,{...entry,cents:900},now),'old historical price is not current');
b.cents=900;assert(!Shelf.isLowestEntry(state,entry,now));b.cents=1000;assert(Shelf.isLowestEntry(state,entry,now),'ties included');
a.status='blocked';assert(!Shelf.isLowestEntry(state,entry,now));a.status='ok';a.checkedAt=now-6*86400000;assert(!Shelf.isLowestEntry(state,entry,now));a.checkedAt=now;
state.games[0].paused=true;assert(!Shelf.isLowestEntry(state,entry,now));state.games[0].paused=false;
state.hiddenStores=['one'];assert(!Shelf.isLowestEntry(state,entry,now));state.hiddenStores=[];
b.currency='GBP';b.cents=700;assert(Shelf.isLowestEntry(state,entry,now),'unconvertible prices excluded');state.manualRates.GBP={value:1.2,source:'override'};assert(!Shelf.isLowestEntry(state,entry,now),'conversion matches grid');
state.compareDelivered=true;a.shippingCents=0;a.shippingCurrency='EUR';assert(Shelf.isLowestEntry(state,entry,now),'unknown shipping excluded');b.shippingCents=0;b.shippingCurrency='GBP';assert(!Shelf.isLowestEntry(state,entry,now));
assert(!Shelf.isLowestEntry(state,{title:'Legacy summary',message:'Text only'},now));assert(!Shelf.isLowestEntry(state,{...entry,currency:'USD'},now));
console.log('PASS summary lowest-row matching, historical amounts, ties, blocked/stale/paused/hidden exclusions, FX and delivered totals');
