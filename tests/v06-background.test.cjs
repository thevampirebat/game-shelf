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
const ctx=vm.createContext({AbortController,clearTimeout:()=>{},fetch:async()=>({ok:true,json:async()=>[{base:'EUR',quote:'USD',rate:1.1,date:new Date().toISOString().slice(0,10)}]}),browser,crypto:globalThis.crypto,URL,Intl,Date,console,setTimeout:fn=>{queueMicrotask(fn);return 1;},structuredClone});
vm.runInContext(fs.readFileSync(root+'/core.js','utf8'),ctx);
vm.runInContext(fs.readFileSync(root+'/background.js','utf8'),ctx);
const send=m=>handler(m,{url:'moz-extension://test/dashboard.html'});
const flush=()=>new Promise(r=>setImmediate(r));
async function finish(){for(let i=0;i<100;i++){await flush();if(disk.progress?.running===false)return;}throw Error('Run did not finish');}
(async()=>{
 await flush();await flush();
 const a='https://www.amazon.ie/dp/B0TEST1234',b='https://www.amazon.ie/dp/B0TEST5678';
 const base=url=>({url,status:'ok',currency:'EUR',cents:3000,availability:'InStock'});
 await send({type:'add',url:a,name:'First',reading:base(a),selector:'#price'});
 await send({type:'add',url:b,name:'Second',reading:base(b)});
 const ids=()=>disk.shelf.games.map(g=>g.id), listings=()=>disk.shelf.games.flatMap(g=>g.listings);
 await send({type:'add',url:a,name:'Duplicate pasted URL'});
 assert.equal(listings()[0].selector,'#price');assert.equal(disk.shelf.games.length,2);
 await send({type:'trackingSettings',notificationMode:'summary',stockAlerts:true,retryFailed:true,notifyScanFailures:false});
 ctx.readings=new Map([[a,{...base(a),cents:2000}],[b,{...base(b),cents:1500}]]);
 vm.runInContext('visit=async l=>readings.get(l.url)',ctx);
 await vm.runInContext('checkAll(true)',ctx);
 assert.equal(notifications.length,1);assert.equal(disk.shelf.lastSummary.items.length,2);assert(disk.shelf.lastSummary.items.every(item=>item.listingId&&item.url&&item.currency==='EUR'&&Number.isSafeInteger(item.cents)));assert(ctx.Shelf.isLowestEntry(disk.shelf,disk.shelf.lastSummary.items[0]));
 assert.equal(disk.progress.etaSeconds,null);assert.equal(disk.progress.running,false);
 await vm.runInContext('checkAll(true)',ctx);assert.equal(notifications.length,1,'unchanged prices stay quiet');
 await send({type:'trackingSettings',notificationMode:'individual'});
 ctx.readings.set(a,{...base(a),cents:1800});ctx.readings.set(b,{...base(b),cents:1200});
 await vm.runInContext('checkAll(true)',ctx);assert.equal(notifications.length,3);
 await send({type:'pauseProduct',id:ids()[0],paused:true});ctx.readings.set(a,{...base(a),cents:100});
 await vm.runInContext('checkAll(true)',ctx);assert.equal(listings()[0].cents,1800);assert.equal(disk.progress.total,1);
 await send({type:'pauseProduct',id:ids()[0],paused:false});
 // Only error/blocked listings enter the manual retry; successful listings are untouched.
 await send({type:'add',url:a,reading:{url:a,status:'error',error:'Temporary failure'}});
 await vm.runInContext('checkAll(false,null,null,true)',ctx);assert.equal(disk.progress.total,1);assert.equal(listings()[0].cents,100);
 // Automatic retry is bounded and recovers a transient error at the end.
 ctx.attempts=0;vm.runInContext("visit=async l=>l.url===readings.keys().next().value&&++attempts===1?{status:'error',error:'Temporary'}:readings.get(l.url)",ctx);
 await vm.runInContext('checkAll(true)',ctx);assert.equal(ctx.attempts,2);assert.equal(disk.progress.total,3);assert.equal(listings()[0].status,'ok');
 await send({type:'trackingSettings',notifyScanFailures:true});const failuresBefore=notifications.length;
 ctx.attempts=0;vm.runInContext("visit=async l=>{attempts++;return {status:'blocked',error:'Verification'};}",ctx);
 await vm.runInContext('checkAll(true)',ctx);assert.equal(ctx.attempts,1);assert.equal(disk.progress.total,2);assert.equal(notifications.length,failuresBefore+1);assert.match(notifications.at(-1).message,/verification/);
 await send({type:'trackingSettings',notifyScanFailures:false});await vm.runInContext('checkAll(true)',ctx);assert.equal(notifications.length,failuresBefore+1,'failure toggle silences scan issues');
 const restored=ctx.Shelf.validateBackup(disk.shelf);assert.equal(restored.notifyScanFailures,false);
 vm.runInContext('visit=async l=>readings.get(l.url)',ctx);
 await send({type:'add',url:a,reading:{url:a,status:'unavailable',error:'Out of stock'}});
 const before=notifications.length;
 await send({type:'add',url:a,reading:{url:a,status:'error',error:'Timeout'}});
 await vm.runInContext('checkAll(true)',ctx);
 assert.equal(notifications.length,before+1);assert.match(notifications.at(-1).title,/Back in stock/);
 await vm.runInContext('checkAll(true)',ctx);assert.equal(notifications.length,before+1);
 await send({type:'notifications',enabled:false});ctx.readings.set(a,{...base(a),cents:50});
 await vm.runInContext('checkAll(true)',ctx);assert.equal(notifications.length,before+1);
 await send({type:'listingDetails',id:listings()[0].id,details:'Series X · New',shippingCents:399});
 assert.equal(listings()[0].shippingCents,399);assert.equal(listings()[0].shippingCurrency,'EUR');
 assert((await send({type:'listingDetails',id:listings()[0].id,shippingCents:-1})).error);

 await send({type:'notifications',enabled:true});
 await send({type:'trackingSettings',notificationMode:'summary'});
 await send({type:'targetPrice',id:ids()[0],cents:1000,currency:'EUR'});
 const summaryBefore=notifications.length;await vm.runInContext('checkAll(true)',ctx);
 assert.equal(notifications.length,summaryBefore+1);assert.match(disk.shelf.lastSummary.items[0].title,/Target price/);
 await vm.runInContext('checkAll(true)',ctx);assert.equal(notifications.length,summaryBefore+1);
 await send({type:'targetPrice',id:ids()[0],cents:1000,currency:'EUR'});
 const originalCreate=browser.notifications.create;browser.notifications.create=async()=>{throw Error('Notifications unavailable');};
 await vm.runInContext('checkAll(true)',ctx);assert.equal(listings()[0].targetReached,false);assert.equal(disk.progress.running,false);
 browser.notifications.create=originalCreate;
 ctx.attempts=0;vm.runInContext("visit=async l=>{attempts++;return {status:'error',error:'Still failing'};}",ctx);
 await vm.runInContext('checkAll(true)',ctx);assert.equal(ctx.attempts,4);assert.equal(disk.progress.total,4);

 // Popup delivery is saved on add and update, and absent fields preserve it.
 const shippingURL='https://www.amazon.ie/dp/B0SHIP1234';
 await send({type:'add',url:shippingURL,name:'Delivery test',reading:base(shippingURL),shippingCents:299,shippingCurrency:'EUR'});
 const shipped=()=>listings().find(l=>l.url===shippingURL);
 assert.equal(shipped().shippingCents,299);
 await send({type:'add',url:shippingURL,reading:base(shippingURL)});assert.equal(shipped().shippingCents,299);
 await send({type:'add',url:shippingURL,shippingCents:0,shippingCurrency:'EUR'});assert.equal(shipped().shippingCents,0);
 await send({type:'add',url:shippingURL,shippingCents:null,shippingCurrency:'EUR'});assert.equal(shipped().shippingCents,null);
 assert((await send({type:'add',url:shippingURL,shippingCents:-1,shippingCurrency:'EUR'})).error);
 disk.picked={url:shippingURL,selector:'#old'};
 browser.storage.local.remove=async key=>{delete disk[key];};
 await send({type:'add',url:shippingURL,selector:''});assert.equal(shipped().selector,'');assert.equal(disk.picked,undefined);
 // Successful picks teach one local layout; disabling stops learning; clearing leaves listing selectors.
 const learned={selector:'sale-price.text-lg',origin:'https://www.amazon.ie',store:'amazonIE',currency:'EUR'};
 const pickTab={id:999,url:a};tabs.set(999,pickTab);
 const originalExecute=browser.tabs.executeScript;
 browser.tabs.executeScript=async(id,args)=>args.code?.startsWith('GameShelfReader.pick(')?[{selector:'#chosen',result:base(a),learnedSelector:learned.selector}]:[];
 await send({type:'pick',tabId:999});await flush();await flush();
 assert.equal(disk.shelf.sitePriceRules[0].selector,learned.selector);assert.equal(disk.picked.selector,'#chosen');
 await send({type:'trackingSettings',learnPrices:false});await send({type:'clearPriceRules'});
 await send({type:'pick',tabId:999});await flush();await flush();assert.equal(disk.shelf.sitePriceRules.length,0);
 assert.equal(listings()[0].selector,'#price');
 browser.tabs.executeScript=originalExecute;
 // Out-of-stock alerts use transitions, honour both toggles and support summary mode.
 await send({type:'trackingSettings',outOfStockAlerts:true,notificationMode:'individual'});
 await send({type:'notifications',enabled:true});
 const stockId=listings()[0].id;
 ctx.stockId=stockId;ctx.stockRead={url:a,status:'ok',currency:'EUR',cents:100,availability:'InStock'};
 await vm.runInContext('apply(stockId,stockRead)',ctx);
 let stockBefore=notifications.length;
 ctx.stockRead={url:a,status:'unavailable',unavailableReason:'no-featured-offer'};await vm.runInContext('apply(stockId,stockRead)',ctx);assert.equal(notifications.length,stockBefore);
 ctx.stockRead={url:a,status:'unavailable',unavailableReason:'out-of-stock'};await vm.runInContext('apply(stockId,stockRead)',ctx);assert.equal(notifications.length,stockBefore+1);assert.match(notifications.at(-1).title,/Out of stock/);
 await vm.runInContext('apply(stockId,stockRead)',ctx);assert.equal(notifications.length,stockBefore+1);
 await send({type:'trackingSettings',outOfStockAlerts:false});
 ctx.stockRead={url:a,status:'ok',currency:'EUR',cents:100,availability:'InStock'};await vm.runInContext('apply(stockId,stockRead)',ctx);stockBefore=notifications.length;
 ctx.stockRead={url:a,status:'unavailable'};await vm.runInContext('apply(stockId,stockRead)',ctx);assert.equal(notifications.length,stockBefore);
 vm.runInContext('visit=async l=>readings.get(l.url)',ctx);
 await send({type:'trackingSettings',outOfStockAlerts:true,stockAlerts:false,notificationMode:'summary'});
 ctx.readings.set(a,{url:a,status:'ok',currency:'EUR',cents:100,availability:'InStock'});await vm.runInContext('checkAll(true)',ctx);
 stockBefore=notifications.length;ctx.readings.set(a,{url:a,status:'unavailable'});await vm.runInContext('checkAll(true)',ctx);assert.equal(notifications.length,stockBefore+1);assert.match(disk.shelf.lastSummary.items[0].title,/Out of stock/);
 await vm.runInContext('checkAll(true)',ctx);assert.equal(notifications.length,stockBefore+1);
 assert.equal(ctx.Shelf.validateBackup(disk.shelf).outOfStockAlerts,true);
 // Successful saved selectors now teach reusable layouts without requiring a new pick.
 await send({type:'trackingSettings',learnPrices:true});
 const beforeRead=browser.tabs.executeScript;
 browser.tabs.executeScript=async(id,args)=>args.code?.startsWith('GameShelfReader.read(')?[{...base(a),learnedSelector:'div.product-price span'}]:[];
 await vm.runInContext("readTab(999,'#saved','EUR')",ctx);
 assert(disk.shelf.sitePriceRules.some(r=>r.selector==='div.product-price span'));
 for(let i=0;i<7;i++){ctx.layout='div.price'+i+' span';await vm.runInContext("rememberPriceLayout('https://www.amazon.ie/dp/B0TEST1234','EUR',layout)",ctx);}
 assert.equal(disk.shelf.sitePriceRules.filter(r=>r.origin==='https://www.amazon.ie'&&r.currency==='EUR').length,5);
 const layoutsBefore=JSON.stringify(disk.shelf.sitePriceRules);
 await send({type:'trackingSettings',learnPrices:false});await vm.runInContext("readTab(999,'#saved','EUR')",ctx);assert.equal(JSON.stringify(disk.shelf.sitePriceRules),layoutsBefore);
 browser.tabs.executeScript=beforeRead;
 // Confirmed missing pages must not be revisited by the optional automatic retry.
 await send({type:'trackingSettings',retryFailed:true});ctx.attempts=0;
 vm.runInContext("visit=async l=>{attempts++;return {url:l.url,status:'error',errorReason:'not-found',terminal:true,error:'Page not found (404)'};}",ctx);
 const expectedChecks=ctx.Shelf.scanListings(disk.shelf).length;await vm.runInContext('checkAll(true)',ctx);assert.equal(ctx.attempts,expectedChecks);assert.equal(disk.progress.total,expectedChecks);
 assert(Number.isSafeInteger(disk.shelf.lastCheck.durationMs));assert.equal(disk.shelf.lastCheck.durationMs,disk.shelf.lastCheck.finishedAt-disk.shelf.lastCheck.startedAt);assert.equal(disk.shelf.lastCheck.partial,false);
 vm.runInContext("visit=async l=>{stop=true;return {status:'error',error:'Stopped'};}",ctx);await vm.runInContext('checkAll(true)',ctx);assert.equal(disk.shelf.lastCheck.partial,true);
 assert.equal(ctx.Shelf.validateBackup(disk.shelf).lastCheck.durationMs,disk.shelf.lastCheck.durationMs);
 console.log('PASS summary vs individual alerts, mute, pause/resume, scoped failed retry, bounded scheduled retry, blocked-store suppression, stock transitions and delivery validation');
})().catch(e=>{console.error(e);process.exitCode=1;});
