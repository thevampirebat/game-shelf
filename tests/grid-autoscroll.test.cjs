/* This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync(__dirname+'/../dashboard.js','utf8');const start=src.indexOf('function installGridAutoscroll(');const code=src.slice(start,src.indexOf('installGridAutoscroll(scrollWrap);',start));
const listeners={},winListeners={};let tick,cancelled=0,removed=0,vertical=0,classes=new Set();
const wrap={scrollLeft:0,contains:t=>t.grid};const context={wrap,el:()=>({style:{},setAttribute(){},remove(){removed++;}}),document:{hidden:false,body:{append(){},classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)}},addEventListener:(k,f)=>listeners[k]=f},window:{scrollBy:(x,y)=>vertical+=y,addEventListener:(k,f)=>winListeners[k]=f},requestAnimationFrame:f=>{tick=f;return 1;},cancelAnimationFrame:()=>cancelled++};
vm.runInNewContext(code+'installGridAutoscroll(wrap);',context);
const event=(button=1,link=false,grid=true)=>({button,target:{grid,closest:()=>link?{}:null},clientX:100,clientY:100,preventDefault(){this.prevented=true;},stopImmediatePropagation(){}});
let e=event(1,true);listeners.mousedown(e);assert(!e.prevented);e=event(1,false,false);listeners.mousedown(e);assert(!e.prevented);
e=event();listeners.mousedown(e);assert(e.prevented);tick(0);assert.equal(vertical,0);assert.equal(wrap.scrollLeft,0);
listeners.mousemove({clientX:180,clientY:190});tick(16);assert(vertical>0);assert(wrap.scrollLeft>0);
listeners.mousemove({clientX:20,clientY:10});tick(32);assert(vertical<1);assert(wrap.scrollLeft<1);
listeners.keydown({key:'Escape',preventDefault(){}});assert.equal(removed,1);assert.equal(classes.size,0);assert(cancelled);
listeners.mousedown(event());winListeners.blur();assert.equal(removed,2);
listeners.mousedown(event());context.document.hidden=true;listeners.visibilitychange();assert.equal(removed,3);
listeners.mousedown(event());e=event(0);listeners.mousedown(e);assert(e.prevented);assert.equal(removed,4);
console.log('PASS two-axis scrolling, dead zone, middle-link preservation, outside grid, click/Escape/blur/visibility cleanup');
