/* This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. */
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),core=fs.readFileSync(root+'/core.js','utf8'),background=fs.readFileSync(root+'/background.js','utf8');
const event=()=>({addListener(){}}),flush=()=>new Promise(r=>setImmediate(r));
async function boot(disk){
 let handler;const notices=[];
 const browser={storage:{local:{get:async k=>({[k]:structuredClone(disk[k])}),set:async v=>Object.assign(disk,structuredClone(v))}},permissions:{contains:async()=>true},runtime:{getURL:p=>'moz-extension://test/'+p,onMessage:{addListener:f=>handler=f}},alarms:{create(){},clear:async()=>true,onAlarm:event()},notifications:{onClicked:event(),create:async(id,n)=>{notices.push(n);return id;}},windows:{onRemoved:event()},tabs:{query:async()=>[]}};
 const ctx=vm.createContext({browser,crypto:globalThis.crypto,URL,Intl,Date,console,structuredClone,AbortController,setTimeout:f=>{queueMicrotask(f);return 1;},clearTimeout(){}});
 vm.runInContext(core,ctx);vm.runInContext(background,ctx);await vm.runInContext('ready',ctx);await flush();
 return {ctx,notices,send:m=>handler(m,{url:'moz-extension://test/dashboard.html'})};
}
(async()=>{
 const seed=vm.createContext({crypto:globalThis.crypto,URL,Intl,Date});vm.runInContext(core,seed);const shelf=seed.Shelf.fresh();shelf.fxMode='manual';shelf.scheduleVersion=4;shelf.scanPlan={mode:'manual',times:['22:00'],days:[0,1,2,3,4,5,6],startDate:''};shelf.nextDue=null;shelf.hiddenStores=[];shelf.notificationMode='summary';
 const url='https://www.amazon.ie/dp/B0TEST1234';shelf.games=[{id:'g',name:'Test',listings:[{id:'l',url,store:'amazonIE',currency:'EUR',cents:2000,status:'ok',history:[]}]}];
 const disk={shelf:structuredClone(shelf)};let app=await boot(disk);
 await vm.runInContext("scanNotices=[];scanStartedAt=Date.now();deliverNotice('Price dropped · Test','EUR 20 → EUR 15',null,{listingId:'l',url:'"+url+"',cents:1500,currency:'EUR'})",app.ctx);
 assert.equal(disk.shelf.lastSummary.items.length,1);assert.equal(disk.shelf.lastSummary.inProgress,true);assert.equal(app.notices.length,0);
 // A fresh background has no access to the old memory queue; it reads persisted alerts.
 app=await boot(disk);let restored=(await app.send({type:'state'})).state.lastSummary;assert.equal(restored.items[0].cents,1500);assert.equal(restored.inProgress,false);assert.equal(restored.interrupted,true);assert.equal(app.notices.length,0);
 const previous=JSON.stringify(restored);
 vm.runInContext("visit=async l=>({url:l.url,status:'ok',currency:'EUR',cents:2000,availability:'InStock'})",app.ctx);await vm.runInContext('checkAll(true)',app.ctx);assert.equal(JSON.stringify(disk.shelf.lastSummary),previous,'quiet scans retain saved alerts');
 await app.send({type:'trackingSettings',notificationMode:'individual'});
 vm.runInContext("visit=async l=>({url:l.url,status:'ok',currency:'EUR',cents:1000,availability:'InStock'})",app.ctx);await vm.runInContext('checkAll(true)',app.ctx);
 assert.equal(app.notices.length,1,'individual mode has no extra summary notification');assert.equal(disk.shelf.lastSummary.items[0].cents,1000);assert.equal(disk.shelf.lastSummary.partial,false);
 const lastCheck=JSON.stringify(disk.shelf.lastCheck);const complete=JSON.stringify(disk.shelf.lastSummary);app=await boot(disk);assert.equal(JSON.stringify((await app.send({type:'state'})).state.lastCheck),lastCheck,'last run length survives background restart');assert.equal(JSON.stringify((await app.send({type:'state'})).state.lastSummary),complete);
 await app.send({type:'theme',theme:{accent:'#aabbcc'}});assert.equal(JSON.stringify(disk.shelf.lastSummary),complete);
 const backup=app.ctx.Shelf.validateBackup(JSON.parse(JSON.stringify(disk.shelf)));assert.equal(backup.lastSummary.items[0].cents,1000);assert.equal(backup.lastSummary.items[0].listingId,backup.games[0].listings[0].id);
 await app.send({type:'notifications',enabled:false});vm.runInContext("visit=async l=>({url:l.url,status:'ok',currency:'EUR',cents:500,availability:'InStock'})",app.ctx);await vm.runInContext('checkAll(true)',app.ctx);assert.equal(JSON.stringify(disk.shelf.lastSummary),complete);
 console.log('PASS persisted mid-scan alerts, fresh background restart, interrupted marker, state reload, quiet scans, individual mode without duplicate notifications, settings and backups');
})().catch(e=>{console.error(e);process.exitCode=1;});
