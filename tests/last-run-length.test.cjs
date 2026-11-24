/* This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. */
const assert=require('node:assert/strict');require('../core.js');
assert.equal(Shelf.runLength(0),'0s');assert.equal(Shelf.runLength(250),'1s');assert.equal(Shelf.runLength(41000),'41s');assert.equal(Shelf.runLength(2462000),'41m 02s');assert.equal(Shelf.runLength(3723000),'1h 02m 03s');assert.equal(Shelf.runLength(-1),'—');
const now=Date.now(),value={startedAt:now-2462000,finishedAt:now,durationMs:2462000,partial:false};
assert.deepEqual(Shelf.validLastCheck(value),value);assert.equal(Shelf.validLastCheck({...value,durationMs:1}),null);assert.equal(Shelf.validLastCheck({...value,finishedAt:now+86400000}),null);
const state=Shelf.fresh();state.lastCheck=value;assert.deepEqual(Shelf.validateBackup(state).lastCheck,value);assert.deepEqual(Shelf.migrate(JSON.parse(JSON.stringify(state))).lastCheck,value);delete state.lastCheck;assert.equal(Shelf.validateBackup(state).lastCheck,null);
console.log('PASS seconds/minutes/hours duration display, valid timestamps, backup retention, startup retention and older-state compatibility');
