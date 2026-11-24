/*
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at https://mozilla.org/MPL/2.0/.
*/
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
let handler,alarmHandler,disk={},alarms=new Map(),fetches=0,fail=false,pending=null;
const event=()=>({addListener(){}});
const browser={storage:{local:{get:async k=>({[k]:structuredClone(disk[k])}),set:async v=>Object.assign(disk,structuredClone(v))}},runtime:{getURL:p=>'moz-extension://test/'+p,onMessage:{addListener:f=>handler=f}},permissions:{contains:async()=>true},alarms:{create:(name,config)=>alarms.set(name,config),clear:async name=>alarms.delete(name),onAlarm:{addListener:f=>alarmHandler=f}},windows:{onRemoved:event()},notifications:{onClicked:event(),create:async()=>{}},tabs:{query:async()=>[]}};
const fetch=async url=>{fetches++;if(fail)throw Error('offline');const base=new URL(url).searchParams.get('base');if(pending){const callback=pending;pending=null;await callback();}return {ok:true,json:async()=>[{base,quote:base==='EUR'?'USD':'EUR',rate:base==='EUR'?1.25:.8,date:new Date().toISOString().slice(0,10)}]};};
const ctx=vm.createContext({browser,fetch,AbortController,setTimeout,clearTimeout,Date,Intl,URL,crypto:globalThis.crypto});
for(const name of ['core','background'])vm.runInContext(fs.readFileSync(__dirname+'/../'+name+'.js','utf8'),ctx);
const send=m=>handler(m,{url:'moz-extension://test/popup.html'}),flush=()=>new Promise(r=>setImmediate(r));
(async()=>{
 for(let i=0;i<5;i++)await flush();assert.equal(disk.shelf.hiddenStores.length,5);assert.equal(disk.shelf.customStores.length,0);assert.equal(disk.shelf.exchangeRates.USD.value,.8);assert.equal(fetches,1);
 assert((await send({type:'addStore',store:{name:'My shop',host:'www.amazon.ie',currency:'EUR',region:'Ireland'}})).ok);assert(!disk.shelf.hiddenStores.includes('amazonIE'));
 assert((await send({type:'add',url:'https://www.amazon.ie/dp/B002BA52J6',name:'A novel',category:'Books',platform:'Paperback'})).ok);assert.equal(disk.shelf.games[0].category,'Books');assert(disk.shelf.games[0].createdAt>0);
 assert((await send({type:'productSort',value:'recent'})).ok);assert.equal(disk.shelf.productSort,'recent');
 assert((await send({type:'scheduleSettings',plan:{mode:'manual',times:[],days:[],startDate:''}})).ok);assert.equal(disk.shelf.nextDue,null);assert(!alarms.has('shelf-schedule'));
 const plan={mode:'twiceWeekly',times:['09:00'],days:[1,4],startDate:'2030-01-01'};assert((await send({type:'scheduleSettings',plan})).ok);assert.equal(disk.shelf.scanPlan.mode,'twiceWeekly');assert(disk.shelf.nextDue>=new Date(2030,0,1).getTime());assert(alarms.has('shelf-schedule'));
 const prior=JSON.stringify(disk.shelf.exchangeRates);fail=true;assert((await send({type:'refreshRates'})).error);assert.equal(JSON.stringify(disk.shelf.exchangeRates),prior);assert.match(disk.shelf.fxError,/offline/);fail=false;
 assert((await send({type:'internationalSettings',baseCurrency:'EUR',fxMode:'manual',rates:{USD:.95}})).ok);const calls=fetches;await send({type:'refreshRates'});assert.equal(fetches,calls);assert.equal(disk.shelf.manualRates.USD.value,.95);
 // Switching bases during an in-flight fetch must discard the old base and fetch the new one.
 let release;pending=()=>new Promise(r=>release=r);await send({type:'internationalSettings',baseCurrency:'EUR',fxMode:'auto',rates:{}});for(let i=0;i<5&&!release;i++)await flush();assert(release);
 await send({type:'internationalSettings',baseCurrency:'USD',fxMode:'auto',rates:{}});release();for(let i=0;i<10;i++)await flush();assert.equal(disk.shelf.baseCurrency,'USD');assert.equal(disk.shelf.exchangeRates.EUR.value,1.25);assert.equal(disk.shelf.exchangeRates.USD,undefined);
 console.log('PASS new-install empty stores, adding a built-in from popup data, categories, schedule alarms, offline cache retention, manual mode and in-flight base changes');
})().catch(e=>{console.error(e);process.exitCode=1;});
