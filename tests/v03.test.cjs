/*
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at https://mozilla.org/MPL/2.0/.
*/
const assert=require('node:assert/strict');require('../core.js');const S=Shelf;
const stamp=s=>new Date(s).getTime();const plan=(mode,times,days=[],startDate='')=>({mode,times,days,startDate});
S.configureStores([]);
assert.equal(S.visibleStores(S.fresh()).length,0,'new install must be empty');
const legacy={...S.fresh(),hiddenStores:[],scheduleVersion:3,scanTime:'21:00',scanPlan:undefined};S.migrate(legacy);assert.equal(S.visibleStores(legacy).length,5,'legacy stores preserved');assert.equal(legacy.scanPlan.times[0],'21:00');
const now=stamp('2026-09-25T15:00:00');
assert.equal(S.nextScheduled(now,plan('daily',['22:00'])),stamp('2026-09-25T22:00:00'));
assert.equal(S.nextScheduled(now,plan('twiceDaily',['09:00','21:00'])),stamp('2026-09-25T21:00:00'));
assert.equal(S.nextScheduled(stamp('2026-09-25T21:00:00'),plan('twiceDaily',['09:00','21:00'])),stamp('2026-09-26T09:00:00'));
assert.equal(S.nextScheduled(now,plan('weekly',['10:00'],[1])),stamp('2026-09-28T10:00:00'));
assert.equal(S.nextScheduled(now,plan('twiceWeekly',['10:00'],[2,6])),stamp('2026-09-26T10:00:00'));
assert.equal(S.nextScheduled(now,plan('custom',['10:00','18:00'],[5])),stamp('2026-09-25T18:00:00'));
assert.equal(S.nextScheduled(now,plan('daily',['09:00'],[],'2026-10-10')),stamp('2026-10-10T09:00:00'));
assert.equal(S.nextScheduled(now,plan('manual',[])),null);
assert.throws(()=>S.validateSchedule(plan('twiceDaily',['09:00','09:00'])));assert.throws(()=>S.validateSchedule(plan('weekly',['09:00'],[1,2])));assert.throws(()=>S.validateSchedule(plan('daily',['09:00'],[],'2026-02-30')));
const rates=S.parseOnlineRates([{base:'EUR',quote:'USD',rate:1.25,date:'2026-09-25'},{base:'EUR',quote:'GBP',rate:.8,date:'2026-09-25'},{base:'EUR',quote:'JPY',rate:160,date:'2025-01-01'}],'EUR',now);
assert.equal(rates.USD.value,.8);assert.equal(rates.GBP.value,1.25);assert.equal(rates.JPY,undefined);assert.throws(()=>S.parseOnlineRates({},'EUR',now));
const state={...S.fresh(),exchangeRates:rates};assert.equal(S.convert(1000,'USD',state,now),800);assert.equal(S.convert(1000,'USD',state,now+8*86400000),null);
state.manualRates.USD={value:.95,source:'override',at:now};assert.equal(S.convert(1000,'USD',state,now+8*86400000),950);state.fxMode='manual';assert.equal(S.convert(1000,'GBP',state,now),null);
const list=[{id:'1',name:'Zebra',createdAt:100},{id:'2',name:'Apple',createdAt:300},{id:'3',name:'Book',createdAt:200}];assert.deepEqual(S.sortedProducts(list,'az').map(x=>x.id),['2','3','1']);assert.deepEqual(S.sortedProducts(list,'za').map(x=>x.id),['1','3','2']);assert.deepEqual(S.sortedProducts(list,'recent').map(x=>x.id),['2','3','1']);assert.deepEqual(list.map(x=>x.id),['1','2','3']);
state.scanPlan=plan('twiceWeekly',['10:00'],[2,6]);state.games=[{name:'A book',category:'Books',createdAt:12345,listings:[]}];state.productSort='recent';const imported=S.validateBackup(state);assert.equal(imported.games[0].category,'Books');assert.equal(imported.games[0].createdAt,12345);assert.equal(imported.productSort,'recent');assert.equal(imported.scanPlan.mode,'twiceWeekly');assert.equal(imported.manualRates.USD.value,.95);assert.equal(S.visibleStores(imported).length,0);
assert.deepEqual(S.currencies,[...S.currencies].sort());assert.match(S.currencyLabel('GBP'),/GBP.*Pound/i);
console.log('PASS clean start, legacy preservation, six schedule modes, dates, validation, rate inversion/expiry/overrides, sort persistence and product category backups');
