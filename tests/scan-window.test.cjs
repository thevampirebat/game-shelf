/*
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at https://mozilla.org/MPL/2.0/.
*/
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
async function scenario(mode){
 let handler,removedListener,created=[],focused=[],closed=[],tabs=new Map(),id=100,reads=0;
 const url='https://www.amazon.ie/dp/B002BA52J6';
 const disk={shelf:{version:1,scheduleVersion:3,scanTime:'22:00',notificationThreshold:100,foregroundScans:mode==='foreground',notifications:true,customStores:[],games:[{id:'g',name:'Game',listings:[{id:'l',store:'amazonIE',currency:'EUR',url,history:[]}]}],events:[],nextDue:Date.now()+86400000}};
 if(mode==='foreground')disk.shelf.games[0].listings.push({id:'l2',store:'amazonIE',currency:'EUR',url:'https://www.amazon.ie/dp/B002BA52J7',history:[]});
 const event={addListener(){}};
 const browser={permissions:{contains:async()=>!mode.startsWith('missing')},storage:{local:{async get(k){return {[k]:disk[k]};},async set(x){Object.assign(disk,x);}}},runtime:{getURL:p=>'moz-extension://test/'+p,onMessage:{addListener(fn){handler=fn;}}},alarms:{create(){},async clear(){},onAlarm:event},notifications:{onClicked:event,async create(){}},windows:{onRemoved:{addListener(fn){removedListener=fn;}},async create(options){created.push(options);if(mode==='failure')throw Error('Cannot create scan window');tabs.set(1,{id:1,windowId:77});return {id:77,tabs:[{id:1}]};},async update(w,options){focused.push({w,...options});},async remove(w){closed.push(w);for(const [k,t] of tabs)if(t.windowId===w)tabs.delete(k);removedListener(w);}},tabs:{async create(options){assert.equal(options.windowId,77);assert.equal(options.active,true);const t={...options,id:++id,status:'complete'};tabs.set(t.id,t);if(mode==='user-tab')tabs.set(999,{id:999,windowId:77});return t;},async get(i){if(mode==='close'){tabs.clear();removedListener(77);throw Error('Closed');}return tabs.get(i);},async query({windowId}){return [...tabs.values()].filter(t=>t.windowId===windowId);},async remove(i){tabs.delete(i);},async executeScript(i,args){if(args.file||args.code.startsWith('Shelf.configure'))return [];reads++;if(mode==='stop')await handler({type:'stop'},{url:'moz-extension://test/dashboard.html'});return [{status:'ok',cents:1000,currency:'EUR',url:tabs.get(i).url}];}}};
 const ctx=vm.createContext({AbortController,clearTimeout:()=>{},fetch:async()=>({ok:true,json:async()=>[{base:'EUR',quote:'USD',rate:1.1,date:new Date().toISOString().slice(0,10)}]}),browser,crypto:globalThis.crypto,URL,Intl,Date,setTimeout:(fn,ms)=>{if(ms<10000)queueMicrotask(fn);return 1;}});
 for(const file of ['core.js','background.js'])vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'..',file),'utf8'),ctx);
 await new Promise(r=>setImmediate(r));if(mode==='missing-manual'){
 const result=await handler({type:'check'},{url:'moz-extension://test/dashboard.html'});
 assert.match(result.error,/Website access missing/);assert.equal(created.length,0);return;
 }
 if(mode==='missing-auto')await vm.runInContext('checkAll(true)',ctx);
 else await handler({type:'check'},{url:'moz-extension://test/dashboard.html'});
 for(let i=0;i<100;i++){await new Promise(r=>setImmediate(r));if(disk.progress?.running===false)break;}
 assert.equal(disk.progress.running,false);if(mode==='missing-auto'){assert.equal(created.length,0);assert.equal(disk.progress.failed,1);assert.match(disk.shelf.games[0].listings[0].error,/Website access missing/);return;}
 assert.equal(created.length,1);assert.equal(created[0].focused,mode==='foreground');if(mode==='foreground'){assert.equal(disk.shelf.foregroundScans,true);assert.deepEqual(focused,[{w:77,focused:true,state:'normal'}]);assert.equal(ctx.Shelf.validateBackup(disk.shelf).foregroundScans,true);}
 if(mode==='user-tab'){assert(tabs.has(999));assert.equal(tabs.size,1);assert.equal(closed.length,0);}
 else {assert.equal(tabs.size,0);if(!['failure','close'].includes(mode))assert.deepEqual(closed,[77]);}
 if(['stop','close'].includes(mode))assert.equal(disk.shelf.games[0].listings[0].cents,undefined);
 if(mode==='failure')assert.match(disk.shelf.games[0].listings[0].error,/Cannot create scan window/);
 if(['normal','foreground'].includes(mode))assert.equal(disk.shelf.games[0].listings[0].cents,1000);
}
(async()=>{for(const mode of ['normal','foreground','stop','close','failure','user-tab','missing-manual','missing-auto'])await scenario(mode);console.log('PASS dedicated window targeting, completion/stop cleanup, user-close cancellation, creation failure and preservation of user-added tabs');})().catch(e=>{console.error(e);process.exitCode=1;});
