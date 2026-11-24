/* This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. */
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = file => readFileSync(join(__dirname, '..', file), 'utf8');
const first = 'https://www.amazon.ie/dp/B0TEST1234';
const second = 'https://www.amazon.ie/dp/B0TEST5678';

test('stock reader requires clear evidence tied to the exact product or variant', () => {
  const url = 'https://example.com/game';
  let products = [], nodes = {};
  const element = textContent => ({
    textContent, getAttribute:()=>null, closest:()=>null, getClientRects:()=>[{}]
  });
  const document = {
    title:'Game', body:{innerText:'Recommended game: in stock'},
    querySelector:selector=>nodes[selector]?.[0]||null,
    querySelectorAll:selector=>selector==='script[type="application/ld+json"]'
      ? products.map(product=>({textContent:JSON.stringify(product)}))
      : nodes[selector]||[]
  };
  const ctx = vm.createContext({URL,document,getComputedStyle:()=>({}),location:{href:url}});
  vm.runInContext(source('core.js'),ctx);
  vm.runInContext(source('reader.js'),ctx);
  ctx.Shelf.configureStores([{name:'Example',id:'example',host:'example.com',currency:'EUR'}],{});
  const read = page => ctx.GameShelfReader.readStock(page).status;
  const offer = (stock,href) => ({url:href,availability:'https://schema.org/'+stock});
  const product = {'@type':'Product',url,offers:[offer('OutOfStock')]};
  products = [product];
  assert.equal(read(url),'out');
  product.offers = [offer('InStock')];
  assert.equal(read(url),'in');
  product.offers = [offer('InStock'),offer('OutOfStock')];
  assert.equal(read(url),'unknown');
  product.offers = [offer('PreOrder')];
  assert.equal(read(url),'unknown');
  const special = url+'?variant=2';
  product.offers = [offer('InStock',url+'?variant=1'),offer('OutOfStock',special)];
  assert.equal(read(special),'out');
  assert.equal(read(url+'?variant=3'),'unknown');
  products = [];
  assert.equal(read(url),'unknown');
  nodes = {'#availability':[element('Only 3 left in stock')]};
  assert.equal(read(first),'in');
  nodes['#ASIN'] = [{value:'B0TEST5678'}];
  assert.equal(read(first),'unknown');
  nodes = {'#rightCol .a-button-text':[element('See All Buying Options')]};
  assert.equal(read(first),'unknown');
  document.title = 'Robot Check';
  assert.equal(read(first),'blocked');
});

test('independent stock alarm, listing scope, deduplication, and backup round-trip', async () => {
  let clock = Date.now(), handler, onAlarm, finding = 'out', id = 0;
  class Clock extends Date { static now(){return clock;} }
  const alarms = new Map(), tabs = new Map(), visited = [], notifications = [], disk = {};
  const onEvent = {addListener(){}};
  const browser = {
    permissions:{contains:async()=>true},
    storage:{local:{
      async get(key){return {[key]:structuredClone(disk[key])};},
      async set(data){Object.assign(disk,structuredClone(data));}
    }},
    runtime:{getURL:path=>'moz-extension://test/'+path,onMessage:{addListener(fn){handler=fn;}}},
    alarms:{create:(name,options)=>alarms.set(name,options),clear:async name=>alarms.delete(name),onAlarm:{addListener(fn){onAlarm=fn;}}},
    notifications:{onClicked:onEvent,async create(key,notification){notifications.push(notification);}},
    windows:{onRemoved:onEvent,async create(){return {id:1,tabs:[]};},async remove(){}},
    tabs:{
      async create({url}){visited.push(url);tabs.set(++id,url);return {id};},
      async remove(key){tabs.delete(key);},
      async query(){return [];},
      async executeScript(key,args){
        return args.code?.startsWith('GameShelfReader.readStock')?[{status:finding,url:tabs.get(key)}]:[];
      }
    }
  };
  const ctx = vm.createContext({
    Date:Clock, URL, Intl, browser, crypto, AbortController,
    clearTimeout(){},fetch:async()=>({ok:true,json:async()=>[]}),
    setTimeout(fn,ms){if(ms<=750)queueMicrotask(()=>{clock+=ms;fn();});}
  });
  vm.runInContext(source('core.js'),ctx);
  vm.runInContext(source('background.js'),ctx);
  const flush = () => new Promise(resolve=>setImmediate(resolve));
  const send = async message => {
    const response = await handler(message,{url:browser.runtime.getURL('dashboard.html')});
    assert.equal(response.error,undefined);
    return response;
  };
  const finish = async () => {
    for(let i=0;i<100;i++){
      await flush();
      if(!(await send({type:'state'})).running)return;
    }
    assert.fail('Stock check did not finish');
  };
  await flush();
  assert.equal(disk.shelf.stockPlan.mode,'manual');
  assert.equal(alarms.has('shelf-stock-schedule'),false);
  await send({type:'restoreStore',id:'amazonIE'});
  await send({type:'add',url:first,name:'First',stockWatch:true,reading:{url:first,status:'ok',currency:'EUR',cents:2999}});
  const listing = () => disk.shelf.games[0].listings[0];
  await send({type:'add',url:second,name:'Second'});
  const priceBefore = structuredClone(listing());
  await send({type:'scheduleSettings',stockOnly:true,plan:{mode:'daily',times:['09:35']}});
  const priceDue = disk.shelf.nextDue;
  clock = disk.shelf.nextStockDue;
  assert.equal(alarms.get('shelf-stock-schedule').when,clock);
  onAlarm({name:'shelf-stock-schedule'});
  await finish();
  assert.deepEqual(visited,[first]);
  assert.equal(listing().stockState,'out');
  assert.equal(listing().stockCheck.status,'out');
  assert.equal(disk.shelf.nextDue,priceDue);
  assert(disk.shelf.nextStockDue>clock);
  assert.equal(notifications.length,0);
  ctx.listingId = listing().id;
  await vm.runInContext("apply(listingId,{status:'unknown'},true)",ctx);
  assert.equal(listing().stockState,'out');
  finding = 'in';
  await send({type:'check',stockOnly:true,listingId:listing().id});
  await finish();
  assert.equal(listing().stockState,'in');
  assert.match(notifications[0].title,/Back in stock/);
  assert.match(notifications[0].message,/available again/);
  await send({type:'check',stockOnly:true});
  await finish();
  assert.equal(notifications.length,1);
  for(const key of ['cents','history','status','lastAttempt','checkedAt'])assert.deepEqual(listing()[key],priceBefore[key]);
  assert.deepEqual(disk.shelf.events.map(event=>event.type),['back-in-stock','out-of-stock']);
  assert.equal(tabs.size,0);
  const restored = ctx.Shelf.validateBackup(disk.shelf);
  assert.equal(restored.stockPlan.times[0],'09:35');
  assert.equal(restored.games[0].listings[0].stockWatch,true);
  assert.equal(restored.games[0].listings[0].stockCheck.status,'in');
  await send({type:'listingDetails',id:listing().id,stockWatch:false});
  await send({type:'check',stockOnly:true});
  await finish();
  assert.equal(visited.length,3);
  const interval = {mode:'interval',hours:2};
  const rejected = await handler({type:'scheduleSettings',plan:interval},{url:browser.runtime.getURL('dashboard.html')});
  assert.match(rejected.error,/frequency/);
  await send({type:'scheduleSettings',stockOnly:true,plan:interval});
  const hour = 3600000, firstDue = clock+2*hour;
  assert.equal(alarms.get('shelf-stock-schedule').when,firstDue);
  assert.equal(disk.shelf.nextDue,priceDue);
  assert.equal(ctx.Shelf.validateBackup(disk.shelf).stockPlan.hours,2);
  assert.equal(ctx.Shelf.migrate(structuredClone(disk.shelf),clock).nextStockDue,firstDue);
  assert.throws(()=>ctx.Shelf.validateSchedule({mode:'interval',hours:0},true),/1 to 23/);
  assert.equal(ctx.Shelf.nextScheduled(clock,{mode:'interval',hours:1}),clock+hour);
  clock = firstDue+5*hour;
  onAlarm({name:'shelf-stock-schedule'});
  await finish();
  assert.equal(alarms.get('shelf-stock-schedule').when,firstDue+6*hour);
  await send({type:'scheduleSettings',stockOnly:true,plan:{mode:'manual'}});
  assert.equal(alarms.has('shelf-stock-schedule'),false);
});
