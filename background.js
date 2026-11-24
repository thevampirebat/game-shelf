/*
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at https://mozilla.org/MPL/2.0/.
*/
let state, running=false, stop=false, scanWindowId=null, scanAnchorId=null, queue=Promise.resolve();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const ready=browser.storage.local.get('shelf').then(async r=>{state=Shelf.migrate(r.shelf || Shelf.fresh());await browser.storage.local.set({shelf:state});});
let scanNotices=null,scanStartedAt=null;
const listingUndo=new Map();let scanRemovedIds=new Set();
async function deliverNotice(title,message,target=null,listing=null){
  if(scanNotices){
    scanNotices.push({title,message,target,listing});
    await mutate(()=>{state.lastSummary={at:scanStartedAt,partial:true,inProgress:true,items:scanNotices.slice(-500).map(({title,message,listing})=>({title,message,...(listing?{listingId:listing.listingId,url:listing.url,cents:listing.cents,currency:listing.currency}:{})}))};});
    if(state.notificationMode==='summary')return true;
  }
  return alert(title,message);
}
let rateJob=null,rateBase=null;
async function refreshRates(force=false){
  await ready;if(state.fxMode!=='auto')return {ok:true,manual:true};
  if(rateJob){const activeBase=rateBase,result=await rateJob;return state.fxMode==='auto'&&state.baseCurrency!==activeBase?refreshRates(force):result;}
  if(!force&&Date.now()-(state.fxAttemptAt||0)<3600000)return {ok:true,cached:true};
  if(!force&&Date.now()-(state.fxUpdatedAt||0)<12*3600000)return {ok:true,cached:true};
  const base=state.baseCurrency;rateBase=base;
  rateJob=(async()=>{
    await mutate(()=>{state.fxAttemptAt=Date.now();});
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetch('https://api.frankfurter.dev/v2/rates?base='+encodeURIComponent(base),{credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal});
      if(!response.ok)throw Error('Exchange-rate service returned HTTP '+response.status+'.');
      const rates=Shelf.parseOnlineRates(await response.json(),base);
      await mutate(()=>{if(state.baseCurrency!==base||state.fxMode!=='auto')return;state.exchangeRates=rates;state.fxUpdatedAt=Date.now();state.fxError='';});
      return {ok:true};
    }catch(e){await mutate(()=>{if(state.baseCurrency===base&&state.fxMode==='auto')state.fxError='Rates could not refresh. Cached rates remain usable for up to 7 days. '+e.message;});return {error:e.message};}
    finally{clearTimeout(timer);}
  })().finally(()=>{rateJob=null;});
  return rateJob;
}
async function mutate(fn){const job=queue.then(async()=>{await ready;const result=await fn();await browser.storage.local.set({shelf:state});return result;});queue=job.catch(()=>{});return job;}
const find=id=>{for(const g of state.games){const l=g.listings.find(l=>l.id===id);if(l)return {g,l};}return null;};
async function progress(data){await browser.storage.local.set({progress:data});}
async function inject(tabId){await browser.tabs.executeScript(tabId,{file:'core.js',runAt:'document_start'});await browser.tabs.executeScript(tabId,{code:`Shelf.configureStores(${JSON.stringify(state.customStores||[])},${JSON.stringify(state.storeOverrides||{})})`,runAt:'document_start'});await browser.tabs.executeScript(tabId,{file:'reader.js',runAt:'document_start'});}
const shoptoJobs=new Map(),shoptoAttempts=new Map();
async function prepareShoptoCurrency(tabId,currency=null){
  await ready;
  if(shoptoJobs.has(tabId))return shoptoJobs.get(tabId);
  const job=(async()=>{
    const tab=await browser.tabs.get(tabId),product=Shelf.shoptoProduct(tab.url);if(!product)return null;
    let store;try{store=Shelf.identify(tab.url);}catch{return null;}
    const existing=state.games.flatMap(g=>g.listings).find(l=>Shelf.sameListingURL(l.url,tab.url));
    const pending=shoptoAttempts.get(tabId);if(tab.status==='loading'&&pending?.target===tab.url)return null;
    const desired=currency||existing?.currency||store.currency;
    if(desired!=='EUR'||(state.hiddenStores||[]).includes(store.id))return null;
    if(!await browser.permissions.contains({origins:[product.origin+'/*']}))return null;
    await browser.tabs.executeScript(tabId,{file:'shopto.js',runAt:'document_start'});
    const [target]=await browser.tabs.executeScript(tabId,{code:`GameShelfShopTo.currencyURL(${JSON.stringify(desired)},location.href)`});
    if(typeof target!=='string'||!Shelf.sameListingURL(tab.url,target)||!/\/eur(?:\/|$)/i.test(new URL(target).pathname))return null;
    const key=product.origin+'|'+product.language+'|'+product.id,previous=shoptoAttempts.get(tabId),now=Date.now();
    const attempts=previous?.key===key&&now-previous.at<90000?previous.count:0;
    if(attempts>=2)throw Error('ShopTo keeps reverting to pounds. Automatic currency switching stopped; the previous price was kept.');
    shoptoAttempts.set(tabId,{key,count:attempts+1,at:now,target});
    // Re-check the tab before navigating so a late event cannot send the user backwards.
    const latest=await browser.tabs.get(tabId);if(latest.url!==tab.url)return null;
    if(target===tab.url)await browser.tabs.reload(tabId);else await browser.tabs.update(tabId,{url:target});
    return target;
  })();
  shoptoJobs.set(tabId,job);try{return await job;}finally{if(shoptoJobs.get(tabId)===job)shoptoJobs.delete(tabId);}
}
browser.tabs.onUpdated?.addListener((tabId,change)=>{if(change.status==='complete')prepareShoptoCurrency(tabId).catch(()=>{});});
browser.tabs.onRemoved?.addListener(tabId=>{shoptoAttempts.delete(tabId);});
async function rememberPriceLayout(url,currency,selector){
  if(state.learnPrices===false)return;
  const rule={origin:new URL(url).origin,store:Shelf.identify(url).id,currency,selector};
  if(!Shelf.validPriceRules([rule]).length)return;
  const same=r=>r.origin===rule.origin&&r.store===rule.store&&r.currency===rule.currency;
  if((state.sitePriceRules||[]).some(r=>same(r)&&r.selector===selector))return;
  await mutate(()=>{
    if(state.learnPrices===false)return;
    const previous=Shelf.validPriceRules(state.sitePriceRules),others=previous.filter(r=>!same(r)),layouts=previous.filter(same).filter(r=>r.selector!==selector);
    state.sitePriceRules=Shelf.validPriceRules([...others,...layouts.slice(-4),rule]);
  });
}
async function readTab(tabId, selector='', currency=null,waitForCurrency=true){
  const changed=await prepareShoptoCurrency(tabId,currency);
  if(changed){
    if(!waitForCurrency)throw Error('ShopTo is switching to euros; waiting for its euro price.');
    let loaded=false;
    for(let i=0;i<20;i++){await sleep(500);const t=await browser.tabs.get(tabId);if(t.status==='complete'&&t.url===changed){loaded=true;break;}}
    if(!loaded)throw Error('ShopTo is switching to euros. Wait for the page to load and try again.');
  }
  await inject(tabId);
  const [r]=await browser.tabs.executeScript(tabId,{code:`GameShelfReader.read(${JSON.stringify(selector)}, location.href, ${JSON.stringify(currency)}, ${JSON.stringify(state.learnPrices!==false?state.sitePriceRules||[]:[])})`,runAt:'document_start'});
  if(r?.status==='ok'&&selector&&r.learnedSelector)await rememberPriceLayout(r.url,r.currency,r.learnedSelector).catch(()=>{});
  if(r?.url&&Shelf.shoptoProduct(r.url)){const existing=state.games.flatMap(g=>g.listings).find(l=>l.currency===r.currency&&Shelf.sameListingURL(l.url,r.url));if(existing)r.url=existing.url;}
  return r;
}
async function readStockTab(tabId){
  await inject(tabId);
  const [reading]=await browser.tabs.executeScript(tabId,{code:'GameShelfReader.readStock(location.href)',runAt:'document_start'});
  return reading;
}
async function openShelf(){
  const url=browser.runtime.getURL('dashboard.html'), tabs=await browser.tabs.query({});
  const tab=tabs.find(t=>t.url===url);
  if(tab){await browser.windows.update(tab.windowId,{focused:true});await browser.tabs.update(tab.id,{active:true});}
  else await browser.tabs.create({url});
}
async function alert(title,message){
  try{await browser.notifications.create(crypto.randomUUID(),{type:'basic',iconUrl:browser.runtime.getURL('icon.png'),title,message});return true;}
  catch(e){await browser.storage.local.set({notificationError:e.message});return false;}
}
async function apply(id,reading,stockOnly=false){
  let notice,targetNotice,stockNotice,outNotice;
  await mutate(()=>{
    const found=find(id);if(!found)return;
    const {g,l}=found;if(running&&(g.paused||scanRemovedIds.has(l.id)))return;
    if(stockOnly&&!l.stockWatch)return;
    if(reading.url && !Shelf.sameListingURL(Shelf.canonical(reading.url),l.url)) reading={status:'error',error:stockOnly?'Store redirected to a different product.':'Store redirected to a different product. Original price retained.'};
    const at=Date.now();
    const wasOut=l.stockState==='out';
    const change=stockOnly?null:Shelf.record(l,reading,at);
    if(stockOnly)l.stockCheck={at,status:reading.status,message:reading.error||''};
    const stockReading=stockOnly?{status:reading.status==='out'?'unavailable':reading.status==='in'?'ok':reading.status,availability:reading.status==='in'?'InStock':undefined}:{...reading,status:l.status};
    const backInStock=Shelf.stockChange(l,stockReading,at);
    if(backInStock&&state.notifications&&(state.stockAlerts||(l.stockWatch&&state.stockWatchAlerts!==false))){
      const store=Shelf.stores.find(s=>s.id===l.store)?.name||l.store;
      stockNotice={game:g.name,message:store+(!stockOnly&&l.status==='ok'?': '+Shelf.money(l.cents,l.currency):' · Item is available again.')};
      if(!stockOnly&&l.status==='ok')stockNotice.listing={listingId:l.id,url:l.url,cents:l.cents,currency:l.currency};
    }
    if(!wasOut&&l.stockState==='out'&&state.notifications&&state.outOfStockAlerts)outNotice={game:g.name,store:Shelf.stores.find(s=>s.id===l.store)?.name||l.store};
    // History is independent of notification preferences; only confirmed transitions are logged.
    const stockType=backInStock?'back-in-stock':!wasOut&&l.stockState==='out'?'out-of-stock':null;
    if(stockType){
      state.events.unshift({id:crypto.randomUUID(),at:Date.now(),type:stockType,game:g.name,platform:g.platform,store:l.store,storeName:Shelf.stores.find(s=>s.id===l.store)?.name,currency:l.currency,url:l.url,listingId:l.id});
      state.events=state.events.slice(0,500);
    }
    if(!stockOnly&&reading.status==='ok'&&l.status==='ok'&&Shelf.targetCrossing(g,l,state))targetNotice={listingId:l.id,gameId:g.id,game:g.name,store:Shelf.stores.find(s=>s.id===l.store)?.name||l.store,cents:l.cents,currency:l.currency,url:l.url,target:{...g.targetPrice}};
    if(change){
      const event={id:crypto.randomUUID(),at:Date.now(),game:g.name,platform:g.platform,store:l.store,storeName:Shelf.stores.find(s=>s.id===l.store)?.name,currency:l.currency,url:l.url,listingId:l.id,...change};
      state.events.unshift(event);state.events=state.events.slice(0,500);
      if(state.notifications && (change.price<change.old || state.notifyIncreases!==false) && (Shelf.convert(Math.abs(change.price-change.old),l.currency,state)??-1)>=state.notificationThreshold)notice=event;
    }
  });
  if(targetNotice){
    const n=targetNotice,ok=await deliverNotice('Target price reached · '+n.game,n.store+': '+Shelf.money(n.cents,n.currency)+' — at or below your '+Shelf.money(n.target.cents,n.target.currency)+' target.',n,n);
    if(!ok)await mutate(()=>{const found=find(n.listingId);if(found&&JSON.stringify(found.g.targetPrice)===JSON.stringify(n.target))found.l.targetReached=false;});
  }
  if(notice&&!targetNotice){const s=Shelf.stores.find(s=>s.id===notice.store);await deliverNotice(`${notice.price<notice.old?'Price dropped':'Price increased'} · ${notice.game}`,`${s.name}: ${Shelf.money(notice.old,notice.currency)} → ${Shelf.money(notice.price,notice.currency)}${notice.platform?' · '+notice.platform:''}`,null,{listingId:notice.listingId,url:notice.url,cents:notice.price,currency:notice.currency});}
  if(outNotice)await deliverNotice('Out of stock · '+outNotice.game,outNotice.store+': item is now unavailable.');
  if(stockNotice)await deliverNotice('Back in stock · '+stockNotice.game,stockNotice.message,null,stockNotice.listing);
}
async function visit(listing,stockOnly=false){
  let tab;
  try{
    const store=Shelf.identify(listing.url);
    if(!await browser.permissions.contains({origins:[new URL(listing.url).origin+'/*']}))return {status:'error',error:'Website access missing. Click Refresh and allow website access, or use Manage stores → Allow website. This also enables automatic checks.'};
    if(scanWindowId==null){
      const win=await browser.windows.create({url:browser.runtime.getURL('scan.html'),type:'normal',focused:!!state.foregroundScans,titlePreface:'Game Shelf scan · '});
      scanWindowId=win.id;scanAnchorId=win.tabs?.[0]?.id;
    }else if(state.foregroundScans){
      await browser.windows.update(scanWindowId,{focused:true,state:'normal'});
    }
    // Selecting a tab and focusing its window are separate operations.
    tab=await browser.tabs.create({url:listing.url,active:true,windowId:scanWindowId});
    const started=Date.now(),policy=Shelf.scanPolicy?.(listing.url)||{settleMs:0,minimumMs:0,verificationMs:0};
    let deadline=started+Math.max(20000,policy.verificationMs),last=null,stable=null,verificationStarted=null,waitingVerification=false;
    const verificationProgress=async label=>{if(typeof progress==='function'){const {progress:current}=await browser.storage.local.get('progress');await progress({...current,running:true,label});}};
    while(Date.now()<deadline && !stop){
      await sleep(Math.min(last?750:250,Math.max(0,deadline-Date.now())));
      if(stop||Date.now()>=deadline)break;
      let timer;
      try{
        // Read rendered content during loading; slow images/trackers must not hold up a valid price.
        last=await Promise.race([
          stockOnly?readStockTab(tab.id):readTab(tab.id,listing.selector,listing.currency,false),
          new Promise(resolve=>{timer=setTimeout(()=>resolve({status:'error',errorReason:'timeout',terminal:true,error:stockOnly?'Stock check timed out.':policy.verificationMs?'Smyths check timed out; last known price retained.':'Price check timed out after 20 seconds; last known price retained.'}),Math.max(1,deadline-Date.now()));})
        ]);
      }catch(e){last={status:'error',error:'Could not read this store page: '+e.message};}
      finally{if(timer!=null)clearTimeout(timer);}
      if(stop)break;
      if(last?.status==='blocked'&&policy.verificationMs){
        if(verificationStarted==null){verificationStarted=Date.now();deadline=Math.max(deadline,verificationStarted+policy.verificationMs);await verificationProgress('Waiting for Smyths verification to finish…');}
        waitingVerification=true;stable=null;continue;
      }
      if(stockOnly){
        if(last?.status==='in'||last?.status==='out'){
          const key=JSON.stringify([last.status,last.url]);
          if(!stable||stable.key!==key)stable={key,since:Date.now()};
          if(Date.now()-stable.since>=Math.max(750,policy.settleMs)&&Date.now()-started>=policy.minimumMs)return last;
        }else{
          stable=null;
          if(last?.status==='blocked'||(last?.terminal&&!waitingVerification)||last?.errorReason==='not-found')return last;
        }
        continue;
      }
      // A navigation error or temporary stock message is not proof that a CAPTCHA finished.
      if(waitingVerification&&last?.status!=='ok'&&last?.status!=='unavailable'&&last?.errorReason!=='not-found'){stable=null;continue;}
      if((last?.status==='ok'||(policy.verificationMs&&last?.status==='unavailable'))&&policy.settleMs){
        const key=JSON.stringify([last.status,last.url,last.currency,last.cents,last.variantId]);
        if(!stable||stable.key!==key)stable={key,since:Date.now()};
        if(Date.now()-started>=policy.minimumMs&&Date.now()-stable.since>=policy.settleMs){
          if(waitingVerification)await verificationProgress('Verification finished · reading Smyths price…');
          return last;
        }
        continue;
      }
      if(last?.status!=='ok')stable=null;
      if(last?.status==='ok'||last?.status==='blocked'||last?.status==='unavailable'||last?.terminal)return last;
    }
    if(stop)return {status:'error',error:stockOnly?'Stock check cancelled.':'Check cancelled; last price retained.'};
    if(waitingVerification)return {status:'blocked',error:'Smyths verification did not finish within 3 minutes. Open the listing and complete any requested check.'};
    if(stockOnly)return last&&['unknown','error','blocked'].includes(last.status)?last:{status:'unknown',error:'The store did not show a stable stock status.'};
    if(last?.status==='ok'||(policy.verificationMs&&last?.status==='unavailable'))return {status:'error',errorReason:'timeout',error:'Product price did not settle before timeout; last known price retained.'};
    return last || {status:'error',errorReason:'timeout',error:policy.verificationMs?'No confirmed product price found within 3 minutes. Open the listing to complete verification.':'No product price found within 20 seconds.'};

  }catch(e){return {status:'error',error:'Page check failed: '+e.message};}
  finally{if(tab)await browser.tabs.remove(tab.id).catch(()=>{});}
}
async function checkAll(scheduled=false,gameId=null,listingId=null,failedOnly=false,stockOnly=false){
  await ready;if(running)return;
  const stockDueAtStart=state.nextStockDue;
  running=true;stop=false;scanNotices=[];scanStartedAt=Date.now();scanRemovedIds=new Set();
  let done=0,total=0,checked=0,failed=0,skipped=0,runFailed=false;
  const startedAt=Date.now(),retryIds=new Set(),attemptedIds=new Set();
  const report=label=>progress({running,done,total,checked,failed,skipped,label,etaSeconds:running&&total>done?Math.ceil((total-done)*(done?(Date.now()-startedAt)/done:(state.scanAverageMs||8000))/1000):null});
  try{
    await report(stockOnly?'Preparing stock checks…':'Preparing price checks…');
    if(!stockOnly)await refreshRates();
    const list=Shelf.scanListings(state,{gameId,listingId,failedOnly,stockOnly}), blocked=new Set();
    total=list.length;
    await report('Starting checks…');
    for(const listing of list){
      if(stop)break;
      const current=find(listing.id);
      if(scanRemovedIds.has(listing.id) || !current || current.g.paused || (stockOnly&&!current.l.stockWatch) || (!stockOnly && !failedOnly && !retryIds.has(listing.id) && !scheduled && !gameId && !listingId && Date.now()-(listing.lastAttempt||0)<60000)){
        done++;skipped++;await report('Skipped a removed or recently checked listing');continue;
      }
      await report(`${listing.game} · ${Shelf.stores.find(s=>s.id===listing.store).name}`);
      let result;
      if(blocked.has(listing.store)) result={status:'blocked',error:'Store requested verification earlier in this run. Open the listing and retry later.'};
      else result=await visit(listing,stockOnly);
      if(stop)break;
      if(scanRemovedIds.has(listing.id)){done++;skipped++;await report('Skipped a removed listing');continue;}
      await apply(listing.id,result,stockOnly);attemptedIds.add(listing.id);
      if(result.status==='blocked')blocked.add(listing.store);
      if(stockOnly?['in','out'].includes(result.status):find(listing.id)?.l.status==='ok')checked++;else failed++;
      done++;
      // Only retry transient read errors, once, after the first pass.
      if(!stockOnly&&scheduled&&state.retryFailed&&done===total&&!retryIds.size){
        const retry=list.filter(l=>find(l.id)?.l.status==='error'&&find(l.id)?.l.errorReason!=='not-found'&&!find(l.id)?.l.error?.startsWith('Website access missing'));
        for(const l of retry){retryIds.add(l.id);list.push(l);}total=list.length;
      }
      await report(done===total?'Checks finished':'Pausing before the next listing…');
      if(done<total && !blocked.has(listing.store))await sleep(250);
    }
  }catch(e){runFailed=true;await browser.storage.local.set({runError:e.message});}
  finally{
    try{
    const notices=scanNotices||[];scanNotices=null;
    // One read-failure notice per completed scan, after retries have settled.
    // Stock unavailability is not a read failure; recovered retries stay quiet.
    const issues=stockOnly?[]:Array.from(attemptedIds).map(id=>find(id)).filter(f=>f&&!f.g.paused&&['error','blocked'].includes(f.l.status));
    if(!stop&&!runFailed&&issues.length&&state.notifications&&state.notifyScanFailures!==false){
      const names=Array.from(new Set(issues.map(f=>Shelf.stores.find(s=>s.id===f.l.store)?.name||f.l.store)));
      const blocked=issues.some(f=>f.l.status==='blocked');
      await alert('Game Shelf · '+issues.length+' price check'+(issues.length===1?'':'s')+' need attention',names.slice(0,3).join(', ')+(names.length>3?' and '+(names.length-3)+' more':'')+'. '+(blocked?'A store requested verification. Open the affected listing in Firefox, complete any check, then Retry failed.':'Open the grid to see the errors and Retry failed.')+' Last known prices were kept.');
    }
    if(notices.length){
      await mutate(()=>{state.lastSummary={at:scanStartedAt,partial:stop||runFailed,inProgress:false,items:notices.slice(-500).map(({title,message,listing})=>({title,message,...(listing?{listingId:listing.listingId,url:listing.url,cents:listing.cents,currency:listing.currency}:{})}))};});
      if(state.notifications&&state.notificationMode==='summary'){
        const ok=await alert('Game Shelf · '+notices.length+' alert'+(notices.length===1?'':'s')+(stop||runFailed?' · partial scan':''),notices.slice(0,3).map(n=>n.title+' — '+n.message).join('\n')+(notices.length>3?'\nOpen the grid to see all alerts.':''));
        if(!ok)await mutate(()=>{for(const n of notices){const f=n.target&&find(n.target.listingId);if(f&&JSON.stringify(f.g.targetPrice)===JSON.stringify(n.target.target))f.l.targetReached=false;}});
      }
    }
    }finally{
      await closeScanWindow();
      try{
        await mutate(()=>{
          const finishedAt=Date.now();
          state.lastCheck={startedAt,finishedAt,durationMs:Math.max(0,finishedAt-startedAt),partial:stop||runFailed};
          if(scheduled&&stockOnly&&state.nextStockDue===stockDueAtStart){
            state.nextStockDue=Shelf.nextScheduled(finishedAt,state.stockPlan,stockDueAtStart);
          }
          if(!stockOnly){
            if(done)state.scanAverageMs=(finishedAt-startedAt)/done;
            if(!gameId&&!listingId)state.lastRun=finishedAt;
            if(scheduled)state.nextDue=Shelf.nextScheduled(finishedAt,state.scanPlan);
          }
        });
      }finally{
        running=false;
        await report(runFailed?'Checks interrupted':stop?'Checks stopped':total?'Checks finished':'No listings to check');
        await schedule();
      }
    }
}
}
// Keep any tabs the user moved into the scan window; remove only our anchor.
async function closeScanWindow(){
  const id=scanWindowId,anchor=scanAnchorId;scanWindowId=null;scanAnchorId=null;
  if(id==null)return;
  try {
    const tabs=await browser.tabs.query({windowId:id});
    if(tabs.every(t=>t.id===anchor))await browser.windows.remove(id);
    else if(anchor!=null)await browser.tabs.remove(anchor).catch(()=>{});
  } catch(e) { /* The user may already have closed the window. */ }
}
browser.windows.onRemoved.addListener(id=>{if(id===scanWindowId){stop=true;scanWindowId=null;scanAnchorId=null;}});
async function schedule(){
  await ready;
  for(const [name,due] of [['shelf-schedule',state.nextDue],['shelf-stock-schedule',state.nextStockDue]]){
    if(due==null)await browser.alarms.clear(name);
    else browser.alarms.create(name,{when:Math.max(Date.now()+1000,due)});
  }
}
browser.alarms.onAlarm.addListener(a=>{
  if(a.name==='shelf-schedule'&&state?.nextDue!=null&&state.nextDue<=Date.now())checkAll(true);
  if(a.name==='shelf-stock-schedule'&&state?.nextStockDue!=null&&state.nextStockDue<=Date.now())checkAll(true,null,null,false,true);
  if(a.name==='shelf-fx')refreshRates(true);
  if(a.name==='shelf-backup')writeBackup();
});
browser.notifications.onClicked.addListener(()=>openShelf());
async function saveStore(input){
        const s=Shelf.customStore(input);
        if(!await browser.permissions.contains({origins:['https://'+s.host+'/*']}))throw Error('Allow this website in Firefox first.');
        const existing=Shelf.stores.find(x=>(x.host===s.host || 'www.'+x.host===s.host) && (x.pathPrefix||'')===(s.pathPrefix||''));
        if(existing){
          if(state.hiddenStores.includes(existing.id)){
            state.hiddenStores=state.hiddenStores.filter(id=>id!==existing.id);
            state.storeOverrides[existing.id]={name:s.name,region:s.region,currency:s.currency,pathPrefix:existing.pathPrefix||''};
            Shelf.configureStores(state.customStores,state.storeOverrides);
          }
          return {ok:true};
        }
        const proposed=[...state.customStores,s];
        try{Shelf.configureStores(proposed,state.storeOverrides);if(state.games.some(g=>g.listings.some(l=>Shelf.identify(l.url).id!==l.store)))throw Error('This region path would move existing listings to a different store. Remove those listings first or choose a different path.');}
        catch(e){Shelf.configureStores(state.customStores,state.storeOverrides);throw e;}
        state.customStores=proposed;return {ok:true};
}
// The background owns the pending request so closing the popup cannot lose it.
async function finishPendingStore(){
  return mutate(async()=>{
    const pending=state.pendingStore;if(!pending)return state.storeAddStatus?.error?{error:state.storeAddStatus.message}:{ok:true};
    if(Date.now()-pending.at>10*60000){delete state.pendingStore;return {ok:true};}
    if(!await browser.permissions.contains({origins:['https://'+pending.store.host+'/*']}))return {pending:true};
    try{await saveStore(pending.store);state.storeAddStatus={at:Date.now(),message:'Store added: '+pending.store.name};}
    catch(e){state.storeAddStatus={at:Date.now(),message:e.message,error:true};}
    delete state.pendingStore;return {ok:!state.storeAddStatus.error,error:state.storeAddStatus.error?state.storeAddStatus.message:undefined};
  });
}
browser.permissions.onAdded?.addListener(()=>{attachDownloadListener();finishPendingStore();});
let backupBusy=false;
async function writeBackup(force=false){
  await ready;if(backupBusy)return {error:'A backup is already running.'};
  backupBusy=true;
  try{
  const config=Shelf.validBackupSettings(state.backup);
  if(!force&&!config.enabled)return {ok:true};
  if(!await browser.permissions.contains({permissions:['downloads']}))return {error:'Allow backup downloads in Backup settings first.'};
  const {backupStatus={}}=await browser.storage.local.get('backupStatus');
  if(backupStatus.status==='Saving'&&backupStatus.id!=null){const [active]=await browser.downloads.search({id:backupStatus.id});if(active?.state==='in_progress')return {error:'A backup is still downloading.'};await finishBackupDownload(active);if(!force&&active?.state==='complete')return {ok:true};}
  const interval=(config.frequency==='weekly'?7:1)*86400000;
  if(!force&&Date.now()-(backupStatus.completedAt||0)<interval)return {ok:true};
  if(!await browser.permissions.contains({permissions:['downloads']}))return {error:'Allow backup downloads in Backup settings first.'};
  attachDownloadListener();let url;
  try{
    const snapshot=JSON.parse(JSON.stringify(state));delete snapshot.pendingStore;delete snapshot.storeAddStatus;
    const stamp=new Date().toISOString().replace(/[:.]/g,'-');
    const filename=config.folder+'/game-shelf-'+stamp+'.json';
    url=URL.createObjectURL(new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'}));
    const id=await browser.downloads.download({url,filename,saveAs:false,conflictAction:'uniquify'});
    await browser.storage.local.set({backupStatus:{...backupStatus,id,filename,status:'Saving',attemptAt:Date.now()}});
    // Inspect completion after registering the ID to cover very fast downloads too.
    const [item]=await browser.downloads.search({id});await finishBackupDownload(item);
    return {ok:true};
  }catch(e){await browser.storage.local.set({backupStatus:{...backupStatus,status:'Failed: '+e.message}});return {error:e.message};}
  finally{if(url)setTimeout(()=>URL.revokeObjectURL(url),60000);}
  }finally{backupBusy=false;}
}
async function finishBackupDownload(item){
  if(!item)return;const {backupStatus}=await browser.storage.local.get('backupStatus');if(backupStatus?.id!==item.id)return;
  if(item.state==='complete')await browser.storage.local.set({backupStatus:{...backupStatus,status:'Saved',completedAt:Date.now()}});
  else if(item.state==='interrupted')await browser.storage.local.set({backupStatus:{...backupStatus,status:'Failed: '+(item.error||'download interrupted')}});
}
let downloadListenerAttached=false;
function attachDownloadListener(){if(downloadListenerAttached||!browser.downloads?.onChanged)return;downloadListenerAttached=true;
  browser.downloads.onChanged.addListener(async delta=>{if(!delta.state)return;const {backupStatus}=await browser.storage.local.get('backupStatus');if(backupStatus?.id===delta.id){const [item]=await browser.downloads.search({id:delta.id});await finishBackupDownload(item);}});
}
attachDownloadListener();

browser.runtime.onMessage.addListener((m,sender)=>{
  // Only this extension's own UI can change the watchlist.
  if(!sender.url?.startsWith(browser.runtime.getURL('')))return;
  return (async()=>{
    await ready;
    switch(m.type){
      case 'stageStore':await mutate(()=>{state.pendingStore={store:Shelf.customStore(m.store),at:Date.now()};delete state.storeAddStatus;});return await finishPendingStore();
      case 'finishStore':return await finishPendingStore();
      case 'cancelStore':return await mutate(()=>{delete state.pendingStore;return {ok:true};});
      case 'targetPrice':return await mutate(()=>{
        const g=state.games.find(g=>g.id===m.id);if(!g)throw Error('Product no longer exists.');
        if(m.cents==null)delete g.targetPrice;
        else{if(!Number.isSafeInteger(m.cents)||m.cents<0||!Shelf.validCurrency(m.currency))throw Error('Enter a valid non-negative target price.');g.targetPrice={cents:m.cents,currency:m.currency};}
        for(const l of g.listings)delete l.targetReached;return {ok:true};
      });
      case 'trackingSettings':return await mutate(()=>{
        if(m.notificationMode!==undefined){if(!['individual','summary'].includes(m.notificationMode))throw Error('Choose a notification style.');state.notificationMode=m.notificationMode;}
        for(const key of ['stockAlerts','stockWatchAlerts','outOfStockAlerts','retryFailed','compareDelivered','notifyScanFailures','foregroundScans','learnPrices'])if(m[key]!==undefined)state[key]=!!m[key];
        return {ok:true};
      });
      case 'pauseProduct':return await mutate(()=>{const g=state.games.find(g=>g.id===m.id);if(!g)throw Error('Product no longer exists.');g.paused=!!m.paused;return {ok:true};});
      case 'listingDetails':return await mutate(()=>{
        const f=find(m.id);if(!f)throw Error('Listing no longer exists.');
        if(m.shippingCents!=null&&!Shelf.validCost(m.shippingCents))throw Error('Enter a valid delivery cost.');
        f.l.details=String(m.details||'').trim().slice(0,160);f.l.shippingCents=m.shippingCents;f.l.shippingCurrency=f.l.currency;
        if(typeof m.stockWatch==='boolean')f.l.stockWatch=m.stockWatch;
        return {ok:true};
      });
      case 'notifyIncreases':return await mutate(()=>{state.notifyIncreases=!!m.enabled;return {ok:true};});
      case 'theme':return await mutate(()=>{state.theme=Shelf.validTheme(m.theme);return {ok:true};});
      case 'backupSettings':return await mutate(async()=>{const config=Shelf.validBackupSettings(m.config);if(config.enabled&&!await browser.permissions.contains({permissions:['downloads']}))throw Error('Allow downloads to enable automatic backups.');state.backup=config;return {ok:true};});
      case 'backupNow':return await writeBackup(true);
      case 'backupStatus':return await browser.storage.local.get('backupStatus');
      case 'help':await browser.tabs.create({url:browser.runtime.getURL('help.html')});return {ok:true};

      case 'moveStore':return await mutate(()=>{
        const ids=Shelf.visibleStores(state).map(s=>s.id),at=ids.indexOf(m.id),to=at+(m.direction===-1?-1:1);
        if(at>=0&&to>=0&&to<ids.length){[ids[at],ids[to]]=[ids[to],ids[at]];state.storeOrder=ids;}return {ok:true};
      });
      case 'refreshRates':return await refreshRates(true);
      case 'productSort':return await mutate(()=>{if(!Shelf.validSort(m.value))throw Error('Choose a valid sort order.');state.productSort=m.value;return {ok:true};});
      case 'scheduleSettings':{
        const plan=Shelf.validateSchedule(m.plan,m.stockOnly===true);
        await mutate(()=>{
          const due=Shelf.nextScheduled(Date.now(),plan);
          if(m.stockOnly){state.stockPlan=plan;state.nextStockDue=due;}
          else{state.scanPlan=plan;state.scanTime=plan.times[0]||'22:00';state.scheduleVersion=4;state.nextDue=due;}
        });
        await schedule();return {ok:true};
      }
      case 'internationalSettings':{
        if(!Shelf.validCurrency(m.baseCurrency)||!['auto','manual'].includes(m.fxMode))throw Error('Choose a currency and rate mode.');
        const rates={};
        for(const [currency,value] of Object.entries(m.rates||{})){
          if(!Shelf.validCurrency(currency)||!Number.isFinite(value)||value<=0)throw Error('Each custom rate must be a positive number.');
          rates[currency]={value,at:Date.now(),source:'override'};
        }
        await mutate(()=>{if(state.baseCurrency!==m.baseCurrency){state.exchangeRates={};state.fxUpdatedAt=null;state.fxAttemptAt=null;}state.baseCurrency=m.baseCurrency;state.fxMode=m.fxMode;state.manualRates=rates;state.fxError='';});
        if(m.fxMode==='auto')refreshRates(true);return {ok:true};
      }
      case 'editStore':return await mutate(()=>{
        if(running)throw Error('Stop the scan before editing stores.');
        const old=Shelf.stores.find(s=>s.id===m.id);if(!old)throw Error('Store no longer exists.');
        const name=String(m.name||'').trim().slice(0,60),region=String(m.region||'').trim().slice(0,60);
        if(!name||!Shelf.validCurrency(m.currency))throw Error('Enter a name and valid currency.');
        // Existing host/path identity stays stable so saved selectors and histories stay attached.
        const details={name,region,currency:m.currency,pathPrefix:old.pathPrefix||''};
        if(old.custom)Object.assign(state.customStores.find(s=>s.id===old.id),details);
        else state.storeOverrides[old.id]=details;
        Shelf.configureStores(state.customStores,state.storeOverrides);return {ok:true};
      });
      case 'listingCurrency':return await mutate(()=>{
        if(running)throw Error('Stop the scan before changing a listing currency.');
        const found=find(m.id);if(!found||!Shelf.validCurrency(m.currency))throw Error('Choose a valid listing and currency.');
        const l=found.l;if(l.currency!==m.currency){l.history.forEach(h=>{h.currency ||= l.currency;});l.currency=m.currency;l.cents=null;delete l.previous;delete l.changedAt;l.status='pending';l.error='Currency changed — refresh this listing.';}return {ok:true};
      });
      case 'storeColor':return await mutate(()=>{
        if(!Shelf.stores.some(s=>s.id===m.id)||!Shelf.validColor(m.color))throw Error('Choose a valid store colour.');
        state.storeColors[m.id]=m.color;return {ok:true};
      });
      case 'removeStore':return await mutate(()=>{
        if(running)throw Error('Stop the current scan before deleting a store.');
        const store=Shelf.stores.find(s=>s.id===m.id);if(!store)throw Error('Store no longer exists.');
        for(const g of state.games)g.listings=g.listings.filter(l=>l.store!==m.id);
        for(const e of state.events)if(e.store===m.id&&!e.storeName)e.storeName=store.name;
        if(store.custom){state.customStores=state.customStores.filter(s=>s.id!==m.id);delete state.storeColors[m.id];Shelf.configureStores(state.customStores,state.storeOverrides);}
        else if(!state.hiddenStores.includes(m.id))state.hiddenStores.push(m.id);
        return {ok:true};
      });
      case 'restoreStore':return await mutate(()=>{
        if(!Shelf.stores.slice(0,5).some(s=>s.id===m.id))throw Error('Unknown built-in store.');
        state.hiddenStores=state.hiddenStores.filter(id=>id!==m.id);return {ok:true};
      });
      case 'addStore':return await mutate(()=>saveStore(m.store));
      case 'clearPriceRules':return await mutate(()=>{state.sitePriceRules=[];return {ok:true};});
      case 'state':return {state,running,listingUndoTokens:Array.from(listingUndo.keys())};
      case 'dismissListingUndo':return await mutate(()=>{listingUndo.clear();return {ok:true};});
      case 'open':await openShelf();return {ok:true};
      case 'read':{
        const t=await browser.tabs.get(m.tabId);Shelf.canonical(t.url);
        const {picked}=await browser.storage.local.get('picked');
        const url=Shelf.canonical(t.url),existing=state.games.flatMap(g=>g.listings).find(l=>Shelf.sameListingURL(l.url,url));
        const selector=m.automatic?'':picked?.url&&Shelf.sameListingURL(picked.url,url)?picked.selector:(existing?.selector||'');
        return {reading:await readTab(m.tabId,selector,existing?.currency),selector};
      }
      case 'pick':{
        const t=await browser.tabs.get(m.tabId),url=Shelf.canonical(t.url);
        (async()=>{
          await prepareShoptoCurrency(t.id);
          const current=await browser.tabs.get(t.id);if(Shelf.shoptoProduct(t.url)&&(current.status!=='complete'||current.url!==t.url)){await browser.storage.local.set({pickerError:'ShopTo is switching to euros. Wait for the page to load, then choose the price.'});return;}
          await inject(t.id);
          const existing=state.games.flatMap(g=>g.listings).find(l=>Shelf.sameListingURL(l.url,url));
          const [pick]=await browser.tabs.executeScript(t.id,{code:`GameShelfReader.pick(${JSON.stringify(existing?.currency||null)},${state.learnPrices!==false})`});
          if(pick){
            await browser.storage.local.set({picked:{url,...pick}});
            if(pick.learnedSelector)await rememberPriceLayout(url,pick.result.currency,pick.learnedSelector);
          }
        })().catch(e=>browser.storage.local.set({pickerError:e.message}));
        return {ok:true};
      }
      case 'add':{
        const hasShipping=Object.prototype.hasOwnProperty.call(m,'shippingCents');
        if(hasShipping&&m.shippingCents!=null&&(!Shelf.validCost(m.shippingCents)||!Shelf.validCurrency(m.shippingCurrency)))throw Error('Enter a valid delivery cost and currency.');
        const saveShipping=l=>{if(hasShipping){l.shippingCents=m.shippingCents;l.shippingCurrency=m.shippingCurrency||l.currency;}};
        const saveStockWatch=l=>{if(typeof m.stockWatch==='boolean')l.stockWatch=m.stockWatch;};
        const target=Shelf.canonical(m.url),existing=state.games.flatMap(g=>g.listings).find(l=>Shelf.sameListingURL(l.url,target));
        if(m.selector===''){const {picked}=await browser.storage.local.get('picked');if(picked?.url===target)await browser.storage.local.remove('picked');}
        if(existing){
          await mutate(()=>{const found=find(existing.id);if(found){if(m.selector!==undefined)found.l.selector=String(m.selector||'').slice(0,1000);saveShipping(found.l);saveStockWatch(found.l);}});
          if(m.reading?.url===target)await apply(existing.id,m.reading);
          return {ok:true,updated:true};
        }
        return await mutate(()=>{
        const url=Shelf.canonical(m.url),store=Shelf.identify(url);
        if(state.hiddenStores.includes(store.id))throw Error('This store was deleted. Restore it in Manage stores first.');
        if(state.games.some(g=>g.listings.some(l=>l.url===url)))throw Error('This exact listing is already tracked.');
        let g=state.games.find(g=>g.id===m.gameId);
        if(m.gameId && !g)throw Error('That game no longer exists.');
        if(!g){if(!String(m.name||'').trim())throw Error('Enter a game name.');g={category:Shelf.categories.includes(m.category)?m.category:'Games',createdAt:Date.now(),id:crypto.randomUUID(),name:String(m.name).trim().slice(0,200),platform:String(m.platform||'').slice(0,80),listings:[]};}
        const l={id:crypto.randomUUID(),url,store:store.id,currency:store.currency,cents:null,selector:String(m.selector||'').slice(0,1000),history:[],status:'pending'};
        if(m.reading && m.reading.url===url){Shelf.record(l,m.reading);Shelf.stockChange(l,{...m.reading,status:l.status});}
        saveShipping(l);
        saveStockWatch(l);
        g.listings.push(l);if(!state.games.some(x=>x.id===g.id))state.games.push(g);
        return {ok:true};
        });
      }
      case 'removeGame':return await mutate(()=>{state.games=state.games.filter(g=>g.id!==m.id);return {ok:true};});
      case 'quickRemoveListing':return await mutate(()=>{
        const found=find(m.id);if(!found)return {ok:true,removed:false};
        const {g,l}=found,token=crypto.randomUUID();
        listingUndo.set(token,{gameId:g.id,index:g.listings.indexOf(l),listing:JSON.parse(JSON.stringify(l))});
        while(listingUndo.size>100)listingUndo.delete(listingUndo.keys().next().value);
        g.listings=g.listings.filter(item=>item.id!==l.id);if(running)scanRemovedIds.add(l.id);
        return {ok:true,removed:true,token};
      });
      case 'undoRemoveListing':return await mutate(()=>{
        const saved=listingUndo.get(m.token);if(!saved)throw Error('This removal can no longer be undone.');
        const g=state.games.find(g=>g.id===saved.gameId);if(!g)throw Error('The product row was removed. Restore it from a backup if needed.');
        if(!Shelf.stores.some(s=>s.id===saved.listing.store)||(state.hiddenStores||[]).includes(saved.listing.store))throw Error('Restore this store before undoing its listing removal.');
        if(state.games.some(g=>g.listings.some(l=>l.id===saved.listing.id||Shelf.sameListingURL(l.url,saved.listing.url))))throw Error('This listing is already tracked.');
        g.listings.splice(Math.min(saved.index,g.listings.length),0,saved.listing);listingUndo.delete(m.token);
        return {ok:true};
      });
      case 'removeListing':return await mutate(()=>{for(const g of state.games)g.listings=g.listings.filter(l=>l.id!==m.id);return {ok:true};});
      case 'rename':return await mutate(()=>{const g=state.games.find(g=>g.id===m.id);if(g && String(m.name||'').trim()){g.name=String(m.name).trim().slice(0,200);g.platform=String(m.platform||'').slice(0,80);g.category=Shelf.categories.includes(m.category)?m.category:(g.category||'Games');}return {ok:true};});
      case 'settings':{
        if(!Shelf.validTime(m.scanTime))throw Error('Choose a valid daily scan time.');
        if(!Number.isSafeInteger(m.notificationThreshold)||m.notificationThreshold<0)throw Error('Enter a non-negative price threshold with up to two decimals.');
        await mutate(()=>{state.notificationThreshold=m.notificationThreshold;});
        await schedule();return {ok:true};
      }
      case 'notifications':return await mutate(()=>{state.notifications=!!m.enabled;return {ok:true};});
      case 'check':if(running)throw Error('A check is already running.');if(m.gameId&&!state.games.some(g=>g.id===m.gameId))throw Error('Game no longer exists.');if(m.listingId&&!find(m.listingId))throw Error('Listing no longer exists.');if(m.gameId&&m.listingId&&find(m.listingId)?.g.id!==m.gameId)throw Error('Listing does not belong to that game.');for(const l of Shelf.scanListings(state,m)){
        if(!await browser.permissions.contains({origins:[new URL(l.url).origin+'/*']}))throw Error('Website access missing for '+new URL(l.url).hostname+'. Click Refresh and allow access, or use Manage stores → Allow website.');
      }if(running)throw Error('A check is already running.');checkAll(false,m.gameId,m.listingId,!!m.failedOnly,!!m.stockOnly);return {ok:true};
      case 'stop':stop=true;return {ok:true};
      case 'test':return {ok:await alert('Game Shelf · Test alert','Price-change notifications will appear here. Click to open your grid.')};
      case 'import':if(running)throw Error('Stop the current price check before importing.');return await mutate(()=>{const restored=Shelf.validateBackup(m.data);listingUndo.clear();state=restored;Shelf.configureStores(state.customStores,state.storeOverrides);schedule();return {ok:true};});
      default:throw Error('Unknown request.');
    }
  })().catch(e=>({error:e.message}));
});
ready.then(async()=>{finishPendingStore();browser.alarms.create('shelf-backup',{periodInMinutes:60});writeBackup();await progress({running:false,label:'Ready'});browser.alarms.create('shelf-fx',{periodInMinutes:720});refreshRates();if(state.nextDue!=null&&state.nextDue<=Date.now())checkAll(true);else schedule();});
