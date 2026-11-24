/* This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');require('../core.js');
const root=__dirname+'/..',url='https://www.amazon.ie/dp/B0TEST1234';
(async()=>{
 const listing={id:'l',store:'amazonIE',url,currency:'EUR',cents:1000,status:'ok',stockState:'in',history:[]};
 const state=Shelf.fresh();state.notifications=false;state.hiddenStores=[];state.games=[{id:'g',name:'Test',platform:'Xbox',listings:[listing]}];
 const ctx=vm.createContext({Shelf,state,Date,crypto:globalThis.crypto,running:false,mutate:async fn=>fn(),find:()=>({g:state.games[0],l:listing}),deliverNotice:()=>{throw Error('Notifications are off');}});
 const source=fs.readFileSync(root+'/background.js','utf8');vm.runInContext(source.slice(source.indexOf('async function apply('),source.indexOf('async function visit(')),ctx);
 const apply=reading=>ctx.apply('l',reading),ok={status:'ok',url,currency:'EUR',cents:1000,availability:'InStock'};
 await apply({status:'unavailable',unavailableReason:'out-of-stock'});assert.equal(state.events.length,1);assert.equal(state.events[0].type,'out-of-stock');
 await apply({status:'unavailable'});await apply({status:'blocked'});await apply({status:'error'});await apply({...ok,availability:'Unknown'});assert.equal(state.events.length,1,'repeated out and unknown/error states must not duplicate or recover');
 await apply(ok);assert.equal(state.events.length,2);assert.equal(state.events[0].type,'back-in-stock');
 await apply(ok);await apply({status:'unavailable',unavailableReason:'no-featured-offer'});assert.equal(state.events.length,2,'no featured offer is not confirmed out of stock');
 await apply({...ok,cents:900,availability:'OutOfStock'});assert.equal(state.events.length,3);assert.equal(state.events[0].type,'out-of-stock');
 await apply({...ok,cents:900});assert.equal(state.events.length,5,'one recovery event and one simultaneous price change');
 const backup=Shelf.validateBackup(state);assert.equal(backup.events.filter(e=>e.type).length,4);assert.equal(backup.events.filter(e=>!e.type).length,1);assert.equal(Shelf.migrate(JSON.parse(JSON.stringify(state))).events.length,5);
 const events=[{at:100,old:100,price:80,currency:'EUR'},{at:300,type:'out-of-stock'},{at:200,type:'back-in-stock'}];
 assert.deepEqual(Shelf.sortedEvents(events).map(e=>e.at),[300,200,100]);
 for(const order of ['drop','percent'])assert.deepEqual(Shelf.sortedEvents(events,order).map(e=>e.at),[100,300,200]);
 assert.equal(Shelf.sortedEvents(events,'newest','2026-11-19').length,0);
 const html=fs.readFileSync(root+'/dashboard.html','utf8');assert(!/<input id="eventDate"[^>]*hidden/.test(html));
 const js=fs.readFileSync(root+'/dashboard.js','utf8'),nodes={'#eventDate':{value:''},'#eventPeriod':{value:'all'}};let renders=0;
 const ui=vm.createContext({Shelf,$:id=>nodes[id],render:()=>renders++});
 vm.runInContext(js.slice(js.indexOf("$('#eventDate').value=Shelf.localDay();"),js.indexOf("$('#eventDate').onchange=")),ui);
 const handler=js.match(/\$\('#eventDate'\)\.onchange=\(\)=>\{[^\n]+/)[0];vm.runInContext(handler,ui);
 nodes['#eventDate'].value='2026-11-18';nodes['#eventDate'].onchange();assert.equal(nodes['#eventPeriod'].value,'date');assert.equal(nodes['#eventDate'].value,'2026-11-18');assert.equal(renders,1);
 nodes['#eventPeriod'].value='today';nodes['#eventPeriod'].onchange();assert.equal(nodes['#eventDate'].value,Shelf.localDay());
 console.log('PASS stock transitions independent of alerts, deduplication, unknown/no-featured-offer guards, simultaneous price change, backup/restart, sorting/day filters and direct always-visible date selection');
})().catch(e=>{console.error(e);process.exitCode=1;});
