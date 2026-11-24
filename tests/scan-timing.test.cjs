/* This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../background.js','utf8');
async function scenario(readings,{loading=false,hung=false,stopRead=false}={}){
 let now=0,index=0,removed=false;const waits=[];
 const ctx=vm.createContext({URL,Date:{now:()=>now},stop:false,state:{foregroundScans:false},scanWindowId:7,Shelf:{identify:()=>({})},sleep:async ms=>{now+=ms;waits.push(ms);},setTimeout:(f,ms)=>{if(hung)queueMicrotask(()=>{now+=ms;f();});return 1;},clearTimeout(){},readTab:async()=>{if(stopRead)ctx.stop=true;return hung?new Promise(()=>{}):readings[Math.min(index++,readings.length-1)];},browser:{permissions:{contains:async()=>true},tabs:{create:async()=>({id:1}),get:async()=>({status:loading?'loading':'complete'}),remove:async()=>{removed=true;}}}});
 vm.runInContext(source.slice(source.indexOf('async function visit('),source.indexOf('async function checkAll(')),ctx);
 const result=await vm.runInContext("visit({url:'https://www.very.ie/test'})",ctx);
 assert(removed);return {result,waits,now};
}
(async()=>{
 const ok={status:'ok',cents:1799,currency:'EUR',url:'https://www.very.ie/test'};
 let r=await scenario([ok]);assert.equal(r.result.cents,1799);assert.deepEqual(r.waits,[250]);
 r=await scenario([ok,{...ok,cents:1800}],{loading:true});assert.equal(r.result.cents,1799,'first valid price accepted while page is still loading');assert.deepEqual(r.waits,[250]);
 r=await scenario([{status:'error',error:'Not ready'},ok]);assert.equal(r.result.cents,1799);assert.deepEqual(r.waits,[250,750]);
 r=await scenario([{status:'error',error:'Not ready'}]);assert.equal(r.result.status,'error');assert.equal(r.now,20000);
 r=await scenario([{status:'blocked'}]);assert.deepEqual(r.waits,[250]);
 r=await scenario([{status:'error',errorReason:'not-found',terminal:true}]);assert.equal(r.result.errorReason,'not-found');assert.deepEqual(r.waits,[250]);
 r=await scenario([],{hung:true});assert.equal(r.result.errorReason,'timeout');assert.equal(r.now,20000);
 r=await scenario([ok],{stopRead:true});assert.match(r.result.error,/cancelled/);
 assert(source.includes('await sleep(250);'));
 console.log('PASS first valid price during loading, no stability wait, delayed price, 20-second budget including hung reads, terminal 404/blocked exit, stop and tab cleanup');
})().catch(e=>{console.error(e);process.exitCode=1;});
