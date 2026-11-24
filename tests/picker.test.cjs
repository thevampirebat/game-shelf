/*
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at https://mozilla.org/MPL/2.0/.
*/
const assert=require('node:assert/strict');
require('../core.js');require('../reader.js');
const R=globalThis.GameShelfReader;
const leaf=textContent=>({textContent,getAttribute:()=>null});
function price(accessible,split){
 const container={textContent:'€59.99€5999',closest:sel=>sel==='.a-price'?container:null,matches:sel=>sel==='.a-price',querySelectorAll:()=>accessible.map(leaf),querySelector:sel=>leaf(split?.[sel]||'')};
 const child={...leaf('59'),closest:sel=>sel==='.a-price'?container:null};return {container,child};
}
let p=price(['€59.99']);assert.equal(R.pickTarget(p.child),p.container);assert.equal(R.elementPrice(p.child),'€59.99');assert.equal(R.priceText(R.elementPrice(p.child),'EUR'),5999);
p=price(['€59.99','€59.99']);assert.equal(R.elementPrice(p.child),'€59.99');
p=price([], {'.a-price-symbol':'€','.a-price-whole':'59.','.a-price-fraction':'99'});assert.equal(R.elementPrice(p.child),'€59.99');
p=price(['€59.99','€49.99']);assert.equal(R.elementPrice(p.child),'');
assert.equal(R.priceText('Was €69.99 now €59.99','EUR'),null);
console.log('PASS split amount selection, duplicated accessibility text, visible span fallback, ambiguous prices rejected');
