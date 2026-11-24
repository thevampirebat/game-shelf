/*
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at https://mozilla.org/MPL/2.0/.
*/
const assert=require('node:assert/strict');
require('../core.js');
const S=globalThis.Shelf;
let count=0;function test(name,fn){fn();count++;console.log('PASS',name);}
test('European and British money parsing',()=>{assert.equal(S.amount('€1.249,99'),124999);assert.equal(S.amount('£1,249.99'),124999);assert.equal(S.amount('€0.00'),0);assert.equal(S.amount('Was €50 now €30'),null);assert.equal(S.amount(''),null);});
test('URL identity and host restrictions',()=>{assert.equal(S.canonical('https://www.amazon.ie/Game/dp/B0TEST1234/ref=abc?tag=xx'),'https://www.amazon.ie/dp/B0TEST1234');assert.throws(()=>S.identify('https://amazon.ie.evil.test/dp/B0TEST1234'));assert.throws(()=>S.identify('https://www.smythstoys.com/uk/en-gb/game/p/123'));assert.throws(()=>S.canonical('https://www.amazon.ie/s?k=games'));assert.equal(S.canonical('https://ie.webuy.com/product-detail?id=123&ref=test'),'https://ie.webuy.com/product-detail?id=123');});
test('Daily local calendar scheduling',()=>{for(const [input,expected] of [['2026-09-17T21:59:00','2026-09-17T22:00:00'],['2026-09-17T22:00:00','2026-09-18T22:00:00'],['2026-09-21T23:00:00','2026-09-22T22:00:00']])assert.equal(S.nextDue(new Date(input).getTime()),new Date(expected).getTime());});
test('Baseline does not alert; errors never replace price; changes alert once',()=>{const l={currency:'EUR',history:[]};assert.equal(S.record(l,{status:'ok',currency:'EUR',cents:4999},1),null);assert.equal(S.record(l,{status:'blocked',error:'Verification'},2),null);assert.equal(l.cents,4999);assert.equal(l.checkedAt,1);assert.equal(S.record(l,{status:'ok',currency:'GBP',cents:2999},3),null);assert.equal(l.cents,4999);assert.deepEqual(S.record(l,{status:'ok',currency:'EUR',cents:3999},4),{old:4999,price:3999});assert.equal(S.record(l,{status:'ok',currency:'EUR',cents:3999},5),null);assert.deepEqual(S.record(l,{status:'ok',currency:'EUR',cents:5999},6),{old:3999,price:5999});assert.equal(l.history.length,3);});
test('Import supports multiple store listings but rejects duplicate URLs and hostile URLs',()=>{const b={version:1,games:[{name:'Game',listings:[{url:'https://www.amazon.ie/dp/B0TEST1234',cents:3000}]}]};const v=S.validateBackup(b);assert.equal(v.games[0].listings[0].currency,'EUR');assert.equal(v.games[0].listings[0].status,'pending');b.games[0].listings.push({url:'https://www.amazon.ie/dp/B0TEST5678'});assert.equal(S.validateBackup(b).games[0].listings.length,2);b.games[0].listings.push({url:'https://www.amazon.ie/Game/dp/B0TEST1234?tag=other'});assert.throws(()=>S.validateBackup(b));b.games[0].listings=[{url:'javascript:alert(1)'}];assert.throws(()=>S.validateBackup(b));});
console.log(`${count} core test groups passed.`);
