/*
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at https://mozilla.org/MPL/2.0/.
*/
const assert=require('node:assert/strict');require('../core.js');const S=globalThis.Shelf;
const g=(id,name)=>({id,name,platform:'Xbox',listings:[]});
assert.equal(S.suggestGame('Aliens Vs Predator',[g('a','Aliens Vs Predator (18) 2010')],'amazonIE'),'a');
assert.equal(S.suggestGame('SEGA Aliens Vs Predator',[g('a','Aliens Vs Predator (18) 2010')],'amazonIE'),'a');
assert.equal(S.suggestGame('Aliens Vs Predator',[g('a','Aliens Vs Predator (18) 2010'),g('b','Aliens Vs Predator')],'amazonIE'),'');
assert.equal(S.gameSuggestions('Aliens Vs Predator',[g('a','Aliens Vs Predator (18) 2010'),g('b','Aliens Vs Predator')],'amazonIE').length,2);
assert.equal(S.suggestGame('Fable 2',[g('a','Fable 3 (18) 2010')],'amazonIE'),'');
const at=s=>new Date(s).getTime(),events=[{id:'yesterday',at:at('2026-09-20T23:59:59'),old:10000,price:1,currency:'EUR'},{id:'today',at:at('2026-09-21T00:00:00'),old:1000,price:500,currency:'EUR'},{id:'tiny',at:at('2026-09-21T23:59:59'),old:100,price:99,currency:'EUR'},{id:'tomorrow',at:at('2026-09-22T00:00:00'),old:100,price:0,currency:'EUR'}];
assert.deepEqual(S.sortedEvents(events,'drop','2026-09-21').map(e=>e.id),['today','tiny']);
assert.equal(S.sortedEvents(events,'drop').length,4);
assert.equal(S.localDay(at('2026-09-21T23:59:59')),'2026-09-21');
assert.equal(S.nextDue(at('2026-09-21T08:34:59'),'08:35'),at('2026-09-21T08:35:00'));
assert.equal(S.nextDue(at('2026-09-21T08:35:00'),'08:35'),at('2026-09-22T08:35:00'));
const state=S.fresh();state.scanTime='06:45';state.notificationThreshold=245;const restored=S.validateBackup(state);
assert.equal(restored.scanTime,'06:45');assert.equal(restored.notificationThreshold,245);
S.migrate(state);assert.equal(state.scanTime,'06:45');assert.equal(state.notificationThreshold,245);
console.log('PASS local-day boundaries, release metadata matching, ambiguity, settings and backup preservation');
