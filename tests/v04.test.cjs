/*
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at https://mozilla.org/MPL/2.0/.
*/
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
let handler,onAdded,onDownload,disk={},granted=false,downloadAllowed=false,downloadState='complete',downloadCount=0,notices=0,blob;
const event=()=>({addListener(){}}),URLMock=class extends URL{};URLMock.createObjectURL=b=>(blob=b,'blob:test');URLMock.revokeObjectURL=()=>{};
const browser={storage:{local:{get:async k=>({[k]:structuredClone(disk[k])}),set:async x=>Object.assign(disk,structuredClone(x))}},runtime:{getURL:p=>'moz-extension://test/'+p,onMessage:{addListener:f=>handler=f}},permissions:{contains:async r=>r.permissions?downloadAllowed:granted,onAdded:{addListener:f=>onAdded=f}},downloads:{download:async()=>{downloadCount++;return downloadCount;},search:async({id})=>[{id,state:downloadState,error:'DISK_FULL'}],onChanged:{addListener:f=>onDownload=f}},alarms:{create(){},clear:async()=>{},onAlarm:event()},windows:{onRemoved:event()},notifications:{onClicked:event(),create:async()=>notices++},tabs:{query:async()=>[]}};
const ctx=vm.createContext({browser,URL:URLMock,Blob,AbortController,clearTimeout:()=>{},setTimeout:()=>1,fetch:async()=>{throw Error('offline');},Date,Intl,crypto:globalThis.crypto});
for(const f of ['core','background'])vm.runInContext(fs.readFileSync(__dirname+'/../'+f+'.js','utf8'),ctx);
const send=m=>handler(m,{url:'moz-extension://test/popup.html'}),flush=()=>new Promise(r=>setImmediate(r));
(async()=>{
 for(let i=0;i<6;i++)await flush();
 const store={name:'Books',host:'books.example.com',currency:'EUR'};
 assert((await send({type:'stageStore',store})).pending);assert(disk.shelf.pendingStore);assert.equal(disk.shelf.customStores.length,0);
 // No popup callback: only the permission event completes the operation.
 granted=true;onAdded({origins:['https://books.example.com/*']});for(let i=0;i<5;i++)await flush();assert.equal(disk.shelf.customStores.length,1);assert(!disk.shelf.pendingStore);
 await send({type:'finishStore'});assert.equal(disk.shelf.customStores.length,1);
 const url='https://books.example.com/item',reading={url,status:'ok',currency:'EUR',cents:2000};
 await send({type:'add',url,name:'Book',category:'Books',reading});await send({type:'notifyIncreases',enabled:false});
 await send({type:'add',url,reading:{...reading,cents:2500}});assert.equal(notices,0);assert.equal(disk.shelf.events.length,1);
 await send({type:'add',url,reading:{...reading,cents:1500}});assert.equal(notices,1);await send({type:'notifyIncreases',enabled:true});await send({type:'add',url,reading:{...reading,cents:2000}});assert.equal(notices,2);
 await send({type:'theme',theme:{accent:'#123456',background:'#ffffff'}});assert.equal(disk.shelf.theme.accent,'#123456');
 assert((await send({type:'backupSettings',config:{enabled:true,folder:'../bad'}})).error);assert((await send({type:'backupNow'})).error);downloadAllowed=true;
 await send({type:'backupSettings',config:{enabled:true,frequency:'daily',folder:'Shelf Backups'}});assert((await send({type:'backupNow'})).ok);assert.equal(disk.backupStatus.status,'Saved');assert.equal(downloadCount,1);
 const backup=JSON.parse(await blob.text());assert(!backup.pendingStore);assert.equal(backup.games[0].name,'Book');const restored=ctx.Shelf.validateBackup(backup);assert.equal(restored.events.length,3);assert.equal(restored.theme.accent,'#123456');assert.equal(restored.backup.enabled,false);
 downloadState='in_progress';await send({type:'backupNow'});assert.equal(disk.backupStatus.status,'Saving');assert((await send({type:'backupNow'})).error);
 downloadState='interrupted';await onDownload({id:2,state:{current:'interrupted'}});assert.match(disk.backupStatus.status,/Failed/);
 // Revoked downloads permission must be checked before recovering an old download.
 disk.backupStatus={status:'Saving',id:2};downloadAllowed=false;
 const oldSearch=browser.downloads.search;browser.downloads.search=async()=>{throw Error('Must not use revoked API');};
 assert.match((await send({type:'backupNow'})).error,/Allow backup downloads/);
 browser.downloads.search=oldSearch;downloadAllowed=true;disk.backupStatus={};
 const before=downloadCount;downloadState='complete';
 const concurrent=await Promise.all([send({type:'backupNow'}),send({type:'backupNow'})]);
 assert.equal(downloadCount,before+1);assert(concurrent.some(r=>/already running/.test(r.error||'')));
 // A denied request can be cancelled without adding the store on a later grant.
 granted=false;await send({type:'stageStore',store:{...store,host:'denied.example.com'}});await send({type:'cancelStore'});granted=true;onAdded({});for(let i=0;i<5;i++)await flush();assert.equal(disk.shelf.customStores.length,1);
 console.log('PASS popup-independent store grant, cancellation, idempotence, increase toggle with history, theme restore, backup permission/path validation and completion/failure tracking');
})().catch(e=>{console.error(e);process.exitCode=1;});
