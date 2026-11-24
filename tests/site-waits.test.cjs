/* This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');require('../core.js');
const source=fs.readFileSync(__dirname+'/../background.js','utf8');
async function scenario(url,reading){
 let now=0,closed=false;const labels=[];
 const ctx=vm.createContext({URL,Date:{now:()=>now},stop:false,state:{foregroundScans:false},scanWindowId:7,Shelf:{identify:()=>({}),scanPolicy:Shelf.scanPolicy},sleep:async ms=>{now+=ms;},setTimeout:()=>1,clearTimeout(){},readTab:async()=>reading(now,ctx),progress:async p=>labels.push(p.label),browser:{storage:{local:{get:async()=>({progress:{done:1,total:5}})}},permissions:{contains:async()=>true},tabs:{create:async()=>({id:1}),remove:async()=>{closed=true;}}}});
 vm.runInContext(source.slice(source.indexOf('async function visit('),source.indexOf('async function checkAll(')),ctx);
 const result=await vm.runInContext('visit('+JSON.stringify({url})+')',ctx);assert(closed);return {result,now,labels};
}
(async()=>{
 const boox='https://euroshop.boox.com/products/noteair6c?variant=53826690384235',smyths='https://www.smythstoys.com/ie/en-ie/game/p/123';
 const ok=(url,cents,variantId)=>({status:'ok',url,currency:'EUR',cents,variantId});
 let r=await scenario(boox,t=>ok(boox,t<1000?57999:65699,t<1000?'standard':'keyboard'));assert.equal(r.result.cents,65699);assert(r.now>=2500&&r.now<4000);
 r=await scenario(boox,t=>ok(boox,65699,t<1600?'standard':'keyboard'));assert.equal(r.result.variantId,'keyboard');assert(r.now>=3250,'a variant change resets the stability timer even if its price matches');
 r=await scenario(boox,t=>ok(boox,t%2?1:2,String(t)));assert.equal(r.result.status,'error');assert.match(r.result.error,/settle/);assert.equal(r.now,20000);
 r=await scenario(smyths,t=>t<12000?{status:'blocked',error:'Checking your browser'}:ok(smyths,1000));assert.equal(r.result.cents,1000);assert(r.now>=12000);assert(r.labels.some(l=>l.includes('Waiting for Smyths')));assert(r.labels.some(l=>l.includes('Verification finished')));
 r=await scenario(smyths,t=>t<2500?ok(smyths,1000):t<90000?{status:'blocked'}:ok(smyths,1100));assert.equal(r.result.cents,1100);assert(r.now>=93000,'early metadata must not close before delayed CAPTCHA');
 r=await scenario(smyths,t=>t<2000||t>120000?{status:'blocked'}:{status:'error',error:'navigation in progress'});assert.equal(r.result.status,'blocked');assert(r.now>=180000,'transient read errors must not end the human verification wait');
 r=await scenario(smyths,t=>t<110000?{status:'error',error:'challenge not recognised'}:ok(smyths,1000));assert.equal(r.result.status,'ok');assert(r.now>=113000,'unrecognised slow challenge gets the extended budget');
 r=await scenario(smyths,()=>ok(smyths,1000));assert(r.now>=10000&&r.now<11000,'unchallenged Smyths pages have a grace period for delayed verification');
 r=await scenario(smyths,t=>t<7000?{status:'blocked'}:{status:'unavailable',url:smyths});assert.equal(r.result.status,'unavailable');assert(r.now>=10000,'stock results also wait for stability');
 r=await scenario(smyths,()=>({status:'error',errorReason:'not-found',terminal:true}));assert.equal(r.now,250);
 r=await scenario(smyths,()=>({status:'blocked'}));assert.equal(r.result.status,'blocked');assert(r.now>=180000&&r.now<181000);
 r=await scenario(smyths,(t,ctx)=>{if(t>2000)ctx.stop=true;return {status:'blocked'};});assert.match(r.result.error,/cancelled/);
 r=await scenario(smyths,t=>t<35000?{status:'blocked'}:{status:'error',error:'Page not ready'});assert(r.now<=181000,'verification plus price waits remain bounded');
 r=await scenario('https://example.com/products/ordinary',t=>ok('https://example.com/products/ordinary',1000));assert.equal(r.now,250,'unrelated stores still accept the first price');
 r=await scenario(boox,()=>({status:'error',errorReason:'not-found',terminal:true}));assert.equal(r.now,250,'missing pages still close immediately');
 assert.equal(Shelf.scanPolicy('https://boox.com.evil.test/product').settleMs,0);assert.equal(Shelf.scanPolicy('https://smythstoys.com.evil.test/product').verificationMs,0);
 console.log('PASS delayed Boox bundle/price changes, variant fingerprint stability, unsettled timeout, Smyths verification recovery/expiry/stop, total bound and unchanged fast stores/404s');
})().catch(e=>{console.error(e);process.exitCode=1;});
