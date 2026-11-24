/* This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. */
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
let handler;const event=()=>({addListener(){}}),disk={};
const browser={storage:{local:{get:async k=>({[k]:structuredClone(disk[k])}),set:async v=>Object.assign(disk,structuredClone(v))}},runtime:{getURL:p=>'moz-extension://test/'+p,onMessage:{addListener:f=>handler=f}},permissions:{contains:async()=>true},alarms:{create(){},clear:async()=>true,onAlarm:event()},notifications:{create:async()=>{},onClicked:event()},tabs:{query:async()=>[]},windows:{onRemoved:event()}};
const ctx=vm.createContext({browser,URL,Intl,Date,console,crypto:globalThis.crypto,structuredClone,AbortController,setTimeout:f=>{queueMicrotask(f);return 1;},clearTimeout(){}});
vm.runInContext(fs.readFileSync(__dirname+'/../core.js','utf8'),ctx);const s=ctx.Shelf.fresh();s.fxMode='manual';s.scanPlan.mode='manual';s.nextDue=null;s.hiddenStores=[];
const listing=(id,n)=>({id,url:'https://www.amazon.ie/dp/'+n,store:'amazonIE',currency:'EUR',cents:1000,status:'ok',shippingCents:299,shippingCurrency:'EUR',selector:'#price',history:[{at:1,cents:2000,currency:'EUR'}]});
s.games=[{id:'g',name:'A',listings:[listing('a','B0TEST1234'),listing('b','B0TEST5678')]},{id:'h',name:'B',listings:[listing('c','B0TEST9999')]}];disk.shelf=structuredClone(s);
vm.runInContext(fs.readFileSync(__dirname+'/../background.js','utf8'),ctx);const send=m=>handler(m,{url:'moz-extension://test/dashboard.html'});
(async()=>{
 await vm.runInContext('ready',ctx);const before=JSON.stringify(disk.shelf.games);const a=await send({type:'quickRemoveListing',id:'a'}),b=await send({type:'quickRemoveListing',id:'b'});assert(a.token&&b.token);assert.equal(disk.shelf.games[0].listings.length,0);assert.equal(disk.shelf.games.length,2);assert.equal(disk.shelf.games[1].listings[0].id,'c');
 assert.equal((await send({type:'state'})).listingUndoTokens.length,2,'undo controls recover after dashboard reload');
 await send({type:'undoRemoveListing',token:b.token});await send({type:'undoRemoveListing',token:a.token});assert.equal(JSON.stringify(disk.shelf.games),before,'IDs, order, price histories, shipping and selectors restored');
 assert((await send({type:'undoRemoveListing',token:a.token})).error);assert.equal((await send({type:'quickRemoveListing',id:'missing'})).removed,false);
 const removed=await send({type:'quickRemoveListing',id:'a'});await send({type:'add',url:s.games[0].listings[0].url,gameId:'g'});assert((await send({type:'undoRemoveListing',token:removed.token})).error,'duplicate URLs not restored');
 await send({type:'dismissListingUndo'});assert.equal((await send({type:'state'})).listingUndoTokens.length,0);
 // Undo during a scan cannot reintroduce a stale in-flight reading.
 ctx.send=send;ctx.released=null;
 vm.runInContext("visit=async l=>{if(l.id==='c'){const r=await send({type:'quickRemoveListing',id:'c'});await send({type:'undoRemoveListing',token:r.token});}return {url:l.url,status:'ok',currency:'EUR',cents:1};}",ctx);
 await vm.runInContext('checkAll(true)',ctx);assert.equal(disk.shelf.games[1].listings[0].cents,1000);assert.equal(disk.progress.skipped,1);
 const last=await send({type:'quickRemoveListing',id:'c'});await send({type:'import',data:disk.shelf});assert.equal((await send({type:'state'})).listingUndoTokens.length,0);assert((await send({type:'undoRemoveListing',token:last.token})).error);
 console.log('PASS fast multiple removals, retained product rows, undo order/full data, reload tokens, duplicate guard, in-flight scan suppression and import reset');
})().catch(e=>{console.error(e);process.exitCode=1;});
