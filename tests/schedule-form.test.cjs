/*
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at https://mozilla.org/MPL/2.0/.
*/
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/../dashboard.js','utf8');
const fn=source.slice(source.indexOf('function scheduleFromForm()'),source.indexOf('function updateScheduleForm()'));
const fields={'#scheduleMode':{value:'twiceWeekly'},'#scheduleStart':{value:''},'#scheduleTime1':{value:'09:30'},'#scheduleTime2':{value:'18:00'},'#customSecond':{checked:true}};
let selected=[{value:'1'},{value:'4'}];
const ctx=vm.createContext({$:selector=>fields[selector]||null,document:{querySelectorAll:selector=>{assert.equal(selector,'#dayChoices input:checked');return Object.assign({length:selected.length},selected);}}});
vm.runInContext(fn,ctx);
assert.deepEqual(JSON.parse(JSON.stringify(ctx.scheduleFromForm())),{mode:'twiceWeekly',startDate:'',times:['09:30'],days:[1,4]});
selected=[];fields['#scheduleMode'].value='daily';assert.equal(ctx.scheduleFromForm().times[0],'09:30');assert.equal(ctx.scheduleFromForm().days.length,0);
fields['#scheduleMode'].value='twiceDaily';assert.equal(ctx.scheduleFromForm().times.length,2);
fields['#scheduleMode'].value='manual';assert.equal(ctx.scheduleFromForm().times.length,0);
fields['#scheduleMode'].value='interval';fields['#scheduleHours']={valueAsNumber:2};
assert.deepEqual(JSON.parse(JSON.stringify(ctx.scheduleFromForm())),{mode:'interval',hours:2});
console.log('PASS actual schedule form function with selected days, no days and array-like non-iterable DOM collections');
