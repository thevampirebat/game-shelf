/*
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at https://mozilla.org/MPL/2.0/.
*/
const assert=require('node:assert/strict');require('../core.js');const S=globalThis.Shelf;
const g=(id,name,platform='Xbox Series X')=>({id,name,platform,listings:[]});
assert.equal(S.suggestGame('007 First Light Xbox Series X',[g('a','007 First Light')],'very'),'a');
assert.equal(S.suggestGame('Fable 2 Xbox',[g('a','Fable')],'very'),'');
assert.equal(S.suggestGame('Fable PS5',[g('a','Fable')],'very'),'');
assert.equal(S.suggestGame('Fable Xbox',[g('a','Fable'),g('b','Fable')],'very'),'');
assert.equal(S.suggestGame('Fable Deluxe Xbox',[g('a','Fable')],'very'),'');
const occupied=g('a','Fable');occupied.listings=[{store:'very'}];assert.equal(S.suggestGame('Fable Xbox',[occupied],'very'),'a');
const custom=S.customStore({name:'Extra',url:'https://shop.example.ie/product',currency:'EUR'});S.configureStores([custom]);
const url='https://shop.example.ie/product/?variant=red#blue';assert.equal(S.canonical(url),url);assert.throws(()=>S.identify('https://other.shop.example.ie/product'));
const backup={version:1,customStores:[custom],games:[{name:'Test',listings:[{url,cents:1000,selector:'#price'}]}]};
const restored=S.validateBackup(backup);assert.equal(restored.customStores[0].host,custom.host);assert.equal(restored.games[0].listings[0].selector,'#price');
assert.throws(()=>S.validateBackup({...backup,games:[{name:'Bad',listings:[{url:'https://evil.example/product'}]}]}));assert.equal(S.stores.length,6);
assert.throws(()=>S.customStore({name:'Local',url:'http://localhost',currency:'EUR'}));S.configureStores([]);
console.log('PASS title suggestions, ambiguity, edition/platform/sequel guards, custom URL identity and backup validation');
