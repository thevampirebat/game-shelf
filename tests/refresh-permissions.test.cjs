/*
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at https://mozilla.org/MPL/2.0/.
*/
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../dashboard.js'),'utf8');
require('../core.js');
const helper=source.slice(source.indexOf('async function startCheck('),source.indexOf('function link('));
async function run(allowed){
  const calls=[];
  const ctx=vm.createContext({URL,Set,Error,state:{games:[{id:'g',listings:[{id:'l',url:'https://www.very.ie/item'}]},{id:'other',listings:[{id:'x',url:'https://other.example/item'}]}]},Shelf:{scanListings:globalThis.Shelf.scanListings,identify:()=>({host:'very.ie'}),origins:()=>['https://very.ie/*','https://www.very.ie/*']},browser:{permissions:{request:options=>{calls.push(options);return Promise.resolve(allowed);}}},send:async m=>{calls.push(m);return {ok:true};}});
  vm.runInContext(helper,ctx);
  const promise=vm.runInContext("startCheck({gameId:'g'})",ctx);
  assert.equal(calls.length,1,'permission request occurs synchronously in click gesture');
  assert.deepEqual(Array.from(calls[0].origins),['https://www.very.ie/*','https://very.ie/*']);
  if(allowed){await promise;assert.equal(calls[1].type,'check');assert.equal(calls[1].gameId,'g');}
  else {await assert.rejects(promise,/No scan started/);assert.equal(calls.length,1);}
}
(async()=>{await run(true);await run(false);assert(source.includes('startCheck({listingId:l.id})'));assert(source.includes('startCheck({gameId:g.id})'));assert(source.includes('()=>startCheck()'));console.log('PASS scoped gesture permission request, grant then scan, denial prevents scan, all refresh controls use helper');})().catch(e=>{console.error(e);process.exitCode=1;});
