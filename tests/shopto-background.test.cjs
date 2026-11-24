/* This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. */
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const base='https://www.shopto.net/en/game-p1203524/',eur=base+'eur/fr/';
let handler,updated,removed,allowed=true,force=false,malicious=null;const moves=[];
const tab={id:1,url:base,status:'complete'};const disk={};const event=()=>({addListener(){}});
const browser={storage:{local:{get:async k=>({[k]:structuredClone(disk[k])}),set:async v=>Object.assign(disk,structuredClone(v))}},permissions:{contains:async()=>allowed},runtime:{getURL:p=>'moz-extension://test/'+p,onMessage:{addListener:f=>handler=f}},alarms:{clear:async()=>true,create(){},onAlarm:event()},notifications:{create:async()=>{},onClicked:event()},windows:{onRemoved:event()},tabs:{onUpdated:{addListener:f=>updated=f},onRemoved:{addListener:f=>removed=f},get:async()=>({...tab}),query:async()=>[],update:async(id,change)=>{moves.push(change.url);tab.url=change.url;return {...tab};},reload:async()=>moves.push('reload'),executeScript:async(id,args)=>{
 if(args.file)return [];
 if(args.code.startsWith('GameShelfShopTo.currencyURL'))return [malicious||(force||!tab.url.includes('/eur/')?eur:null)];
 if(args.code.startsWith('GameShelfReader.read'))return [{url:tab.url,status:'ok',cents:5978,currency:'EUR'}];
 return [];
}}};
const ctx=vm.createContext({browser,URL,Date,Intl,console,crypto:globalThis.crypto,structuredClone,AbortController,setTimeout:f=>{queueMicrotask(f);return 1;},clearTimeout(){}});
vm.runInContext(fs.readFileSync(__dirname+'/../core.js','utf8'),ctx);const s=ctx.Shelf.fresh();s.fxMode='manual';s.scanPlan.mode='manual';s.nextDue=null;const store=ctx.Shelf.customStore({name:'ShopTo',url:'https://www.shopto.net',currency:'EUR'});s.customStores=[store];s.games=[{id:'g',name:'Game',listings:[{id:'l',url:base,store:store.id,currency:'EUR',cents:6000,status:'ok',history:[]}]}];disk.shelf=structuredClone(s);
vm.runInContext(fs.readFileSync(__dirname+'/../background.js','utf8'),ctx);const flush=()=>new Promise(r=>setImmediate(r));
(async()=>{
 await vm.runInContext('ready',ctx);await flush();updated(1,{status:'complete'});await flush();assert.deepEqual(moves,[eur],'ordinary page completion automatically switches to EUR');
 await vm.runInContext('prepareShoptoCurrency(1)',ctx);assert.equal(moves.length,1,'already EUR stays put');
 tab.url=base;await vm.runInContext('readTab(1)',ctx);assert.equal(moves.length,2,'popup/manual/scan read prepares currency');
 const reading=await vm.runInContext('readTab(1)',ctx);assert.equal(reading.url,base,'saved URL identity retained');ctx.reading=reading;await vm.runInContext("apply('l',reading)",ctx);assert.equal(disk.shelf.games[0].listings[0].cents,5978);
 tab.url=base;allowed=false;await vm.runInContext('prepareShoptoCurrency(1)',ctx);assert.equal(moves.length,2,'no website permission means no navigation');allowed=true;
 await vm.runInContext('prepareShoptoCurrency(1,"GBP")',ctx);assert.equal(moves.length,2,'explicit GBP listing is respected');
 force=true;await assert.rejects(()=>vm.runInContext('prepareShoptoCurrency(1)',ctx),/reverting/,'automatic retries are bounded');
 removed(1);await vm.runInContext('prepareShoptoCurrency(1)',ctx);assert.equal(moves.length,3,'closed tabs release retry state');
 tab.url=base.replace('p1203524','p999');malicious=eur;await vm.runInContext('prepareShoptoCurrency(1)',ctx);assert.equal(moves.length,3,'stale/different-product target rejected');
 const send=m=>handler(m,{url:'moz-extension://test/dashboard.html'});await send({type:'add',url:eur,name:'Game'});assert.equal(disk.shelf.games.length,1);assert.equal(disk.shelf.games[0].listings.length,1,'EUR variant does not duplicate a saved ShopTo product');
 console.log('PASS page-change auto currency, read preparation, price/history identity, permissions, explicit GBP, bounded retry, tab cleanup and duplicate guard');
})().catch(e=>{console.error(e);process.exitCode=1;});
