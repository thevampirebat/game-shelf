/*
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at https://mozilla.org/MPL/2.0/.
*/
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const root=require('node:path').join(__dirname,'..');
let handler,alarms=[],notifications=[],disk={shelf:{version:1,games:[],events:[],nextDue:new Date('2026-09-17T10:00:00').getTime(),notifications:true}},tabs=new Map(),reads=new Map(),created=0;
const event=()=>({addListener(){}});
const browser={
 permissions:{contains:async()=>true},
 storage:{local:{async get(k){return {[k]:structuredClone(disk[k])};},async set(obj){Object.assign(disk,structuredClone(obj));}}},
 runtime:{getURL:p=>'moz-extension://test/'+p,onMessage:{addListener(fn){handler=fn;}}},
 alarms:{clear:async()=>true,create:(name,opt)=>alarms.push({name,...opt}),onAlarm:event()},
 notifications:{onClicked:event(),async create(id,opts){notifications.push(opts);}},
 windows:{async update(){},async create(){return {id:99,tabs:[]};},async remove(){},onRemoved:event()},
 tabs:{async query(){return [];},async create({url}){const t={id:++created,url,status:'complete'};tabs.set(t.id,t);return t;},async get(id){return tabs.get(id);},async remove(id){tabs.delete(id);},async executeScript(id,args){return args.file?[]:[reads.get(tabs.get(id).url)||{status:'error',error:'Fixture missing'}];}}
};
const ctx=vm.createContext({AbortController,clearTimeout:()=>{},fetch:async()=>({ok:true,json:async()=>[{base:'EUR',quote:'USD',rate:1.1,date:new Date().toISOString().slice(0,10)}]}),browser,crypto:globalThis.crypto,URL,Intl,Date,console,setTimeout:(fn,ms)=>{if(ms<10000)queueMicrotask(fn);return 1;},structuredClone});
vm.runInContext(fs.readFileSync(root+'/core.js','utf8'),ctx);
vm.runInContext(fs.readFileSync(root+'/background.js','utf8'),ctx);
const send=m=>handler(m,{url:'moz-extension://test/dashboard.html'});
const flush=()=>new Promise(r=>setImmediate(r));
async function finish(){for(let i=0;i<100;i++){await flush();if(disk.progress?.running===false)return;}throw Error('Run did not finish');}
(async()=>{
 await flush();await flush();assert(alarms.length);assert.equal(disk.shelf.scheduleVersion,4);assert.equal(new Date(disk.shelf.nextDue).getHours(),22);console.log('PASS startup migrates existing alarm to 10pm');
 const url='https://www.amazon.ie/dp/B0TEST1234';
 const base={url,status:'ok',currency:'EUR',cents:5000,source:'fixture'};
 await send({type:'add',url,name:'Test Game',platform:'Xbox',reading:base});
 assert.equal(disk.shelf.games.length,1);assert.equal(notifications.length,0);
 await send({type:'add',url,name:'Duplicate',reading:{...base,cents:4000}});
 assert.equal(disk.shelf.games.length,1);assert.equal(disk.shelf.events.length,1);assert.equal(notifications.length,1);
 await send({type:'add',url,reading:{...base,cents:4000}});assert.equal(notifications.length,1);
 console.log('PASS manual baseline, single change notification, duplicate refresh');
 await send({type:'add',url,selector:'#price',reading:{url,status:'blocked',error:'verification'}});
 assert.equal(disk.shelf.games[0].listings[0].cents,4000);assert.equal(disk.shelf.games[0].listings[0].selector,'#price');
 console.log('PASS failed refresh retains price and saves repaired selector');
 await send({type:'add',url:'https://www.amazon.ie/dp/B0TEST5678',name:'Other game'});
 reads.set('https://www.amazon.ie/dp/B0TEST5678',{status:'blocked',error:'Verification'});
 await send({type:'add',url:'https://www.amazon.ie/dp/B0TEST9012',name:'Third game'});
 reads.set('https://www.amazon.ie/dp/B0TEST9012',{status:'ok',cents:1,currency:'EUR'});
 await send({type:'check'});await finish();
 assert.equal(created,1);assert.equal(tabs.size,0);assert.equal(disk.shelf.games[2].listings[0].status,'blocked');
 console.log('PASS checks stop visiting a blocked store; temporary tab closes');
 const rejected=await send({type:'add',url:'https://evil.test/',name:'Bad'});assert(rejected.error);
 assert.equal(handler({type:'removeGame',id:disk.shelf.games[0].id},{url:'https://www.amazon.ie/dp/B0TEST1234'}),undefined);
 console.log('PASS host and message-sender validation');
 assert.equal(disk.progress.done,3);assert.equal(disk.progress.total,3);assert.equal(disk.progress.failed,2);assert.equal(disk.progress.skipped,1);assert.equal(disk.progress.running,false);
 console.log('PASS final progress counts include failed and skipped listings');
 assert.equal(disk.shelf.notificationThreshold,100);
 const initialNotices=notifications.length;
 await send({type:'add',url,reading:{...base,cents:3901}});assert.equal(notifications.length,initialNotices);
 await send({type:'add',url,reading:{...base,cents:3801}});assert.equal(notifications.length,initialNotices+1);
 await send({type:'add',url,reading:{...base,cents:4000}});
 assert((await send({type:'settings',scanTime:'08:35',notificationThreshold:30})).ok);
 assert((await send({type:'scheduleSettings',plan:{mode:'daily',times:['08:35'],days:[],startDate:''}})).ok);
 assert.equal(disk.shelf.scanTime,'08:35');assert.equal(new Date(disk.shelf.nextDue).getHours(),8);assert.equal(new Date(disk.shelf.nextDue).getMinutes(),35);
 assert((await send({type:'settings',scanTime:'25:00',notificationThreshold:30})).error);
 assert((await send({type:'settings',scanTime:'08:35',notificationThreshold:-1})).error);
 console.log('PASS default €1 boundary, custom threshold and immediate schedule validation');
 const before=notifications.length,eventsBefore=disk.shelf.events.length;
 await send({type:'add',url,reading:{...base,cents:3971}});
 assert.equal(notifications.length,before);assert.equal(disk.shelf.events.length,eventsBefore+1);assert.equal(disk.shelf.games[0].listings[0].cents,3971);
 await send({type:'add',url,reading:{...base,cents:3941}});assert.equal(notifications.length,before+1);
 await send({type:'add',url,reading:{...base,cents:3970}});assert.equal(notifications.length,before+1);
 await send({type:'add',url,reading:{...base,cents:4000}});assert.equal(notifications.length,before+2);
 console.log('PASS changes under 30 cents remain in history without alerts; exact 30-cent changes alert in both directions');
 const first=disk.shelf.games[0], beforeTabs=created;
 reads.set(url,{...base,cents:5000});
 await send({type:'check',gameId:first.id});await finish();
 assert.equal(created,beforeTabs+1);assert.equal(disk.progress.total,1);assert.equal(first.id,disk.shelf.games[0].id);assert.equal(disk.shelf.games[0].listings[0].cents,5000);
 console.log('PASS per-game refresh bypasses recent check and visits only that game');
 browser.permissions={async contains(){return false;}};
 assert((await send({type:'addStore',store:{name:'Extra',host:'shop.example.ie',currency:'EUR'}})).error);
 browser.permissions.contains=async()=>true;
 assert((await send({type:'addStore',store:{name:'Extra',host:'shop.example.ie',currency:'EUR'}})).ok);
 const custom='https://shop.example.ie/item?variant=red';
 await send({type:'add',url:custom,name:'Custom game',selector:'#price'});
 reads.set(custom,{url:custom,status:'ok',cents:2500,currency:'EUR'});
 await send({type:'check',gameId:disk.shelf.games.at(-1).id});await finish();
 assert.equal(disk.shelf.games.at(-1).listings[0].cents,2500);
 console.log('PASS custom store permission gate and refresh');
 const gameId=disk.shelf.games[0].id, secondURL='https://www.amazon.ie/dp/B002BA52J6';
 assert((await send({type:'add',url:secondURL,gameId,reading:{...base,url:secondURL,cents:2300}})).ok);
 assert.equal(disk.shelf.games[0].listings.length,2);
 await send({type:'add',url:secondURL,gameId,reading:{...base,url:secondURL,cents:2300}});
 assert.equal(disk.shelf.games[0].listings.length,2);
 const target=disk.shelf.games[0].listings[1],untouched=structuredClone(disk.shelf.games[0].listings[0]),startCount=created,lastRun=disk.shelf.lastRun;
 reads.set(secondURL,{...base,url:secondURL,cents:2100});
 assert((await send({type:'check',listingId:target.id})).ok);await finish();
 assert.equal(created,startCount+1);assert.equal(disk.progress.total,1);assert.equal(disk.progress.checked,1);
 assert.deepEqual(disk.shelf.games[0].listings[0],untouched);assert.equal(disk.shelf.games[0].listings[1].cents,2100);assert.equal(disk.shelf.lastRun,lastRun);
 assert((await send({type:'check',listingId:'missing'})).error);
 assert((await send({type:'check',listingId:target.id,gameId:disk.shelf.games[1].id})).error);
 reads.set(secondURL,{status:'unavailable',error:'Not available'});await send({type:'check',listingId:target.id});await finish();
 assert.equal(disk.shelf.games[0].listings[1].cents,2100);assert.equal(disk.progress.failed,1);
 console.log('PASS multiple listings, exact URL deduplication, isolated retry and failed price retention');
 assert((await send({type:'storeColor',id:'amazonIE',color:'#ff0077'})).ok);
 assert.equal(disk.shelf.storeColors.amazonIE,'#ff0077');assert((await send({type:'storeColor',id:'amazonIE',color:'red;'})).error);
 const backup=structuredClone(disk.shelf);assert((await send({type:'import',data:backup})).ok);
 assert.equal(disk.shelf.games[0].listings.length,2);assert.equal(disk.shelf.storeColors.amazonIE,'#ff0077');assert.equal(disk.shelf.scanTime,backup.scanTime);
 const savedCustomGame=structuredClone(disk.shelf.games.at(-1));
 assert((await send({type:'removeStore',id:'amazonIE'})).ok);
 assert(disk.shelf.hiddenStores.includes('amazonIE'));assert.equal(disk.shelf.games[0].listings.length,0);assert.deepEqual(disk.shelf.games.at(-1),savedCustomGame);
 assert((await send({type:'add',url,name:'Deleted store'})).error);
 assert((await send({type:'restoreStore',id:'amazonIE'})).ok);assert(!disk.shelf.hiddenStores.includes('amazonIE'));
 await send({type:'add',url:custom,reading:{url:custom,status:'ok',cents:2400,currency:'EUR'}});
 const nEvents=disk.shelf.events.length;
 assert((await send({type:'removeStore',id:'custom:shop.example.ie'})).ok);
 assert.equal(disk.shelf.customStores.length,0);assert.equal(disk.shelf.games.at(-1).listings.length,0);assert.equal(disk.shelf.events.length,nEvents);assert.equal(disk.shelf.events[0].storeName,'Extra');
 assert((await send({type:'addStore',store:{name:'Extra',host:'shop.example.ie',currency:'EUR'}})).ok);
 console.log('PASS store colours and multiple-listing backup, scoped store deletion, built-in restoration, custom re-add and retained event names');

 assert((await send({type:'internationalSettings',baseCurrency:'EUR',fxMode:'manual',rates:{USD:.9,GBP:1.18}})).ok);
 assert((await send({type:'internationalSettings',baseCurrency:'EUR',fxMode:'manual',rates:{USD:-1}})).error);
 assert.equal(disk.shelf.manualRates.USD.value,.9);
 assert((await send({type:'editStore',id:'amazonUK',name:'UK shop',region:'United Kingdom',currency:'GBP'})).ok);
 assert.equal(disk.shelf.storeOverrides.amazonUK.name,'UK shop');
 assert((await send({type:'moveStore',id:'amazonUK',direction:-1})).ok);assert.equal(disk.shelf.storeOrder[0],'amazonUK');
 assert((await send({type:'addStore',store:{name:'US region',host:'shop.example.ie',pathPrefix:'/us',currency:'USD'}})).ok);
 const foreign='https://shop.example.ie/us/game';
 assert((await send({type:'add',url:foreign,name:'Foreign game',reading:{url:foreign,status:'ok',cents:1000,currency:'USD'}})).ok);
 const notices=notifications.length;
 await send({type:'settings',scanTime:'22:00',notificationThreshold:100});
 await send({type:'add',url:foreign,reading:{url:foreign,status:'ok',cents:900,currency:'USD'}});assert.equal(notifications.length,notices);
 await send({type:'add',url:foreign,reading:{url:foreign,status:'ok',cents:700,currency:'USD'}});assert.equal(notifications.length,notices+1);
 const listing=disk.shelf.games.at(-1).listings[0];
 assert((await send({type:'listingCurrency',id:listing.id,currency:'CAD'})).ok);
 assert.equal(disk.shelf.games.at(-1).listings[0].cents,null);assert.equal(disk.shelf.games.at(-1).listings[0].history[0].currency,'USD');
 console.log('PASS international settings validation, editable built-ins, ordering, regional stores, converted alert thresholds and listing currency history');
})().catch(e=>{console.error(e);process.exitCode=1;});
