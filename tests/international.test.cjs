/*
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at https://mozilla.org/MPL/2.0/.
*/
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
require('../core.js');const S=globalThis.Shelf;
const custom=[{name:'US shop',host:'shop.example.com',currency:'USD',region:'United States',pathPrefix:'/us'},{name:'Japan shop',host:'shop.example.com',currency:'JPY',region:'Japan',pathPrefix:'/jp'}];
S.configureStores(custom,{amazonUK:{name:'My UK Amazon',currency:'GBP'}});
assert.equal(S.identify('https://shop.example.com/us/game').currency,'USD');assert.equal(S.identify('https://shop.example.com/jp/game').currency,'JPY');assert.throws(()=>S.identify('https://shop.example.com/usa/game'));
assert.equal(S.stores.find(s=>s.id==='amazonUK').name,'My UK Amazon');
const now=Date.now(),state={...S.fresh(),customStores:custom,storeOverrides:{amazonUK:{name:'My UK Amazon',currency:'GBP'}},exchangeRates:{USD:{value:0.9,at:now},JPY:{value:0.006,at:now}},games:[{name:'Test',listings:[{url:'https://shop.example.com/us/game',currency:'USD',cents:1000,history:[{at:now,cents:1200,currency:'USD'}]},{url:'https://shop.example.com/jp/game',currency:'JPY',cents:150000}]}]};
const imported=S.validateBackup(state);assert.equal(imported.games[0].listings[0].currency,'USD');assert.equal(imported.games[0].listings[1].currency,'JPY');assert.equal(imported.games[0].listings[0].history[0].currency,'USD');assert.equal(imported.exchangeRates.USD.value,.9);
const items=[{id:'eur',currency:'EUR',cents:1000,status:'ok',checkedAt:now},{id:'usd',currency:'USD',cents:1000,status:'ok',checkedAt:now},{id:'gbp',currency:'GBP',cents:1,status:'ok',checkedAt:now}];
assert.deepEqual(S.lowest(items,state,now),['usd']);assert.equal(S.convert(1000,'USD',state,now+8*86400000),null);assert.deepEqual(S.lowest(items,state,now+86400000),['usd']);
assert.equal(S.convert(1000,'GBP',state),null);assert.equal(S.money(150000,'JPY'),'JP¥1,500');
const ctx=vm.createContext({Shelf:S});vm.runInContext(fs.readFileSync(__dirname+'/../reader.js','utf8'),ctx);const price=ctx.GameShelfReader.priceText;
for(const [raw,currency,n] of [['$1,299.95','USD',129995],['1.299,95 €','EUR',129995],['₺1.299,95','TRY',129995],['¥1,500','JPY',150000],["CHF 1’299.95",'CHF',129995],['1 299,95 zł','PLN',129995],['kr. 1.299','ISK',129900],['1,299','JPY',129900],['USD42.91','USD',4291]])assert.equal(price(raw,currency),n,raw);
for(const [raw,currency] of [['Was $50 now $30','USD'],['USD 50 CAD','USD'],['€20','USD'],['$20 $30','USD'],['20 30','USD']])assert.equal(price(raw,currency),null,raw);
console.log('PASS regional URL routing, backup currency/history preservation, safe conversion, expired and missing rates, international formats and ambiguous price rejection');
