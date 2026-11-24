/*
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at https://mozilla.org/MPL/2.0/.
*/
const assert=require('node:assert/strict');require('../core.js');const s=Shelf.fresh(),g={targetPrice:{cents:1000,currency:'EUR'}},l={status:'ok',currency:'EUR',cents:1001};
assert.equal(Shelf.targetCrossing(g,l,s),false);l.cents=1000;assert.equal(Shelf.targetCrossing(g,l,s),true);assert.equal(Shelf.targetCrossing(g,l,s),false);l.status='error';assert.equal(Shelf.targetCrossing(g,l,s),false);assert.equal(l.targetReached,true);l.status='ok';l.cents=1001;assert.equal(Shelf.targetCrossing(g,l,s),false);l.cents=999;s.notifications=false;assert.equal(Shelf.targetCrossing(g,l,s),false);s.notifications=true;assert.equal(Shelf.targetCrossing(g,l,s),true);
l.currency='USD';l.cents=1000;l.targetReached=false;assert.equal(Shelf.targetCrossing(g,l,s),false);s.exchangeRates.USD={value:.9,at:Date.now()};assert.equal(Shelf.targetCrossing(g,l,s),true);s.games=[{name:'Test',targetPrice:g.targetPrice,listings:[]}];assert.deepEqual(Shelf.validateBackup(s).games[0].targetPrice,g.targetPrice);console.log('PASS inclusive target, no repeats, rearm, failures, mute, conversion and backup');
