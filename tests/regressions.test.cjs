/*
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at https://mozilla.org/MPL/2.0/.
*/
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
require('../core.js');const S=globalThis.Shelf;
let count=0;function test(name,fn){fn();count++;console.log('PASS',name);}
const very='https://www.very.ie/xbox-007-first-light-xbox-series-x/1601175510.prd';
const smyths='https://www.smythstoys.com/ie/en-ie/gaming-and-tech/games/007-first-light/007-first-light-xbox-series-x/p/253645';
test('Both supplied URLs work with a non-iterable keys() result',()=>{
 const original=URLSearchParams.prototype.keys;
 URLSearchParams.prototype.keys=function(){return {next(){return {done:true};}};};
 try{for(const url of [very,smyths]){
  assert.equal(S.canonical(url),url);
  assert.equal(S.canonical(url+'?utm_source=test&utm_source=again&ref=abc&gclid=xyz&edition=standard'),url+'?edition=standard');
 }}finally{URLSearchParams.prototype.keys=original;}
});
test('Twice-weekly alarm migrates to daily 10pm without losing watchlist',()=>{
 const now=new Date('2026-09-17T15:00:00').getTime(),g={id:'game'},s={scheduleVersion:2,games:[g],nextDue:new Date('2026-09-21T22:00:00').getTime()};
 S.migrate(s,now);assert.equal(s.nextDue,new Date('2026-09-17T22:00:00').getTime());assert.equal(s.games[0],g);
 S.migrate(s,new Date('2026-09-18T12:00:00').getTime());assert.equal(s.nextDue,new Date('2026-09-17T22:00:00').getTime());
});
test('Currency switch establishes baseline, preserves correctly labelled history',()=>{
 const l={store:'amazonUK',currency:'GBP',cents:4999,previous:5999,history:[{at:1,cents:4999}]};
 assert.equal(S.record(l,{status:'ok',currency:'EUR',cents:5499},2),null);
 assert.equal(l.currency,'EUR');assert.equal(l.previous,undefined);assert.equal(l.history[0].currency,'GBP');assert.equal(l.history[1].currency,'EUR');
 assert.deepEqual(S.record(l,{status:'ok',currency:'EUR',cents:4499},3),{old:5499,price:4499});
});
test('Legacy GBP backup is not relabelled as EUR',()=>{
 const out=S.validateBackup({version:1,games:[{name:'007',listings:[{url:'https://www.amazon.co.uk/dp/B0TEST1234',currency:'GBP',cents:4999,history:[{at:1,cents:4999}]}]}]});
 assert.equal(out.games[0].listings[0].currency,'GBP');assert.equal(out.games[0].listings[0].history[0].currency,'GBP');
});
test('Lowest-price highlight includes UK EUR, ties, and excludes failed/stale/GBP readings',()=>{
 const now=Date.now(),make=(id,cents,extra={})=>({id,cents,currency:'EUR',status:'ok',checkedAt:now,...extra});
 assert.deepEqual(S.lowestEUR([make('ie',5000),make('uk',4000,{store:'amazonUK'}),make('very',4000),make('gbp',3000,{currency:'GBP'}),make('old',1000,{checkedAt:now-6*86400000}),make('blocked',1000,{status:'blocked'})],now),['uk','very']);
 assert.deepEqual(S.lowestEUR([make('single',5000)],now),['single']);
});
// Focused reader unit tests: synthetic node API, not real retailer/browser DOM.
function readAmazon(price,picked=false){
 const n={textContent:price,getAttribute:()=>null,closest:()=>null,getClientRects:()=>[{}]};
 const document={title:'Example game',body:{innerText:''},querySelector:()=>null,querySelectorAll:sel=>sel==='#chosen'||sel.includes('.priceToPay .a-offscreen')?[n]:[]};
 const ctx=vm.createContext({Shelf:S,document,location:{href:'https://www.amazon.co.uk/dp/B0TEST1234'},getComputedStyle:()=>({display:'block',visibility:'visible'})});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../reader.js'),'utf8'),ctx);
 return ctx.GameShelfReader.read(picked?'#chosen':'');
}
test('Amazon UK automatic and picked prices read their actual currency',()=>{
 for(const picked of [false,true])for(const [txt,currency,cents] of [['€59.99','EUR',5999],['EUR 49,99','EUR',4999],['£39.99','GBP',3999]]){
  const r=readAmazon(txt,picked);assert.equal(r.status,'ok');assert.equal(r.currency,currency);assert.equal(r.cents,cents);
 }
 assert.equal(readAmazon('€59.99 / £49.99').status,'error');
});
test('Recent change sorting uses all history before display limit and retains tiny changes',()=>{
 const a={id:'small',old:100,price:99,currency:'EUR',at:3},b={id:'big',old:1000,price:500,currency:'EUR',at:1},c={id:'rise',old:100,price:200,currency:'EUR',at:4};
 const events=[a,b,c];assert.deepEqual(S.sortedEvents(events,'drop').map(e=>e.id),['big','small']);assert.deepEqual(S.sortedEvents(events,'newest').map(e=>e.id),['rise','small','big']);assert.deepEqual(S.sortedEvents(events,'percent').map(e=>e.id),['big','small']);assert.equal(events[0],a);
});
console.log(`${count} regression groups passed.`);
