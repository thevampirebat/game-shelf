/*
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at https://mozilla.org/MPL/2.0/.
*/
const $=s=>document.querySelector(s), el=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!=null)n.textContent=txt;return n;};
const send=async m=>{const r=await browser.runtime.sendMessage(m);if(r?.error)throw Error(r.error);return r;};
const date=t=>t?new Date(t).toLocaleString('en-IE',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'Never';
const tell=s=>$('#message').textContent=s;
let state,manageId,settingsDirty=false,urlSelectionManual=false,editingStockSchedule=false;
async function startCheck(options={}){
  const listings=Shelf.scanListings(state,options);
  if(options.stockOnly&&!listings.length)throw Error('Enable Watch stock on an active listing first.');
  const origins=[...new Set(listings.flatMap(l=>[new URL(l.url).origin+'/*',...Shelf.origins(Shelf.identify(l.url))]))];
  // Request directly from the click gesture, before messaging the background.
  if(origins.length&&!await browser.permissions.request({origins}))throw Error('Website access was not granted. No scan started. Click Refresh and allow access to enable manual and automatic checks.');
  return send({type:'check',...options});
}
function link(url,label,cls){const a=el('a',cls,label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;}
function stockNote(l){
  if(l.stockState==='in')return l.stockWatch?el('span','caption',latestStockIssue(l)?'Last known in stock':'In stock'):null;
  if(l.stockState!=='out'&&(l.status!=='unavailable'||l.unavailableReason==='no-featured-offer'))return null;
  const n=el('span','stockDuration');
  const duration=Shelf.stockDuration(l.outOfStockSince);
  const known=l.stockCheck?.at>=(l.lastAttempt||0)?l.stockCheck.status==='out':(l.status==='unavailable'&&l.unavailableReason!=='no-featured-offer')||(l.status==='ok'&&Shelf.availabilityState(l.availability)==='out');
  n.dataset.stockPrefix=known?'Out of stock for ':'Last known out of stock · ';
  if(duration){n.dataset.stockSince=String(l.outOfStockSince);n.textContent=n.dataset.stockPrefix+duration;n.title='First observed unavailable: '+new Date(l.outOfStockSince).toLocaleString();}
  else n.textContent=(known?'Out of stock':'Last known out of stock')+' · duration starts with next stock check';
  return n;
}
function latestStockIssue(l){
  return l.stockCheck?.at>=(l.lastAttempt||0)&&['unknown','error','blocked'].includes(l.stockCheck.status);
}
function updateStockNotes(){
  document.querySelectorAll('[data-stock-since]').forEach(n=>{n.textContent=n.dataset.stockPrefix+Shelf.stockDuration(Number(n.dataset.stockSince));});
}
setInterval(updateStockNotes,60000);
const removedListingTokens=[];
function renderListingUndo(){
  $('#listingUndo').hidden=!removedListingTokens.length;
  $('#listingUndoMessage').textContent=removedListingTokens.length+' listing'+(removedListingTokens.length===1?'':'s')+' removed · undo available in this browser session';
}
function quickRemoveButton(l,gameName,storeName){
  const b=el('button','listingRemove','×');b.type='button';
  b.title='Remove this listing only: '+l.url;b.setAttribute('aria-label','Remove '+storeName+' listing for '+gameName);
  b.onclick=async e=>{
    e.preventDefault();e.stopPropagation();if(b.disabled)return;b.disabled=true;
    try{const result=await send({type:'quickRemoveListing',id:l.id});
      if(result.removed){removedListingTokens.push(result.token);if(removedListingTokens.length>100)removedListingTokens.shift();renderListingUndo();}
      await refresh();
    }catch(error){b.disabled=false;tell(error.message);}
  };
  return b;
}
$('#undoListingRemoval').onclick=async e=>{
  const b=e.currentTarget;if(b.disabled||!removedListingTokens.length)return;b.disabled=true;
  try{await send({type:'undoRemoveListing',token:removedListingTokens[removedListingTokens.length-1]});removedListingTokens.pop();renderListingUndo();await refresh();}
  catch(error){tell(error.message);}finally{b.disabled=false;}
};
$('#dismissListingUndo').onclick=async()=>{try{await send({type:'dismissListingUndo'});removedListingTokens.length=0;renderListingUndo();}catch(error){tell(error.message);}};
function refreshListingButton(l,label='↻ Refresh listing',stockOnly=false){
  const b=el('button','listingRefresh',label);b.title='Refresh only '+l.url;b.disabled=$('#check').disabled; b.dataset.paused=state.games.some(g=>g.paused&&g.listings.some(x=>x.id===l.id))?'true':'false';b.disabled||=b.dataset.paused==='true';
  b.onclick=async()=>{b.disabled=true;try{if(stockOnly)await startCheck({listingId:l.id,stockOnly:true});else await startCheck({listingId:l.id});}catch(e){b.disabled=$('#check').disabled; b.dataset.paused=state.games.some(g=>g.paused&&g.listings.some(x=>x.id===l.id))?'true':'false';tell(e.message);$('#manageMessage').textContent=e.message;}};
  return b;
}
function render(){
  Shelf.configureStores(state.customStores,state.storeOverrides);applyTheme(state.theme);$('#notifyIncreases').checked=state.notifyIncreases!==false;$('#notifyIncreases').disabled=!state.notifications;
  renderUpgradeSettings();
  const headers=$('#storeHeaders');headers.replaceChildren(el('th','','PRODUCT / VARIANT'));
  for(const s of Shelf.visibleStores(state)){const h=el('th','',s.name);h.scope='col';h.style.boxShadow='inset 0 5px '+Shelf.storeColor(state,s.id);const dot=el('i','dot');dot.style.backgroundColor=Shelf.storeColor(state,s.id);h.prepend(dot);h.append(el('small','',[s.region,s.currency].filter(Boolean).join(' · ')));headers.append(h);}
  headers.append(el('th','','Actions'));
  const table=$('.tableWrap table');table.style.minWidth=(280+Shelf.visibleStores(state).length*150)+'px';
  queueHeader();
  const listings=state.games.flatMap(g=>g.listings);
  $('#gameCount').replaceChildren(document.createTextNode(state.games.length+' '),el('small','','products'));
  $('#listingCount').replaceChildren(document.createTextNode(listings.length+' '),el('small','','tracked'));
  if(!settingsDirty){$('#scanTime').value=state.scanTime;$('#threshold').value=(state.notificationThreshold/100).toFixed(2);}
  $('#nextDue').textContent='Next: '+(state.nextDue?date(state.nextDue)+' · local time':'Manual checks only');
  $('#scheduleSummary').textContent=Shelf.scheduleLabel(state.scanPlan);
  const watched=listings.filter(l=>l.stockWatch).length;
  $('#stockScheduleSummary').textContent=Shelf.scheduleLabel(state.stockPlan)+' · '+watched+' watched';
  $('#nextStockDue').textContent=state.nextStockDue?'Next stock check: '+date(state.nextStockDue)+' · local time':'';
  if($('#currencyDialog').open)showRateStatus();
  const lastCheck=Shelf.validLastCheck(state.lastCheck);$('#lastRunLength').textContent='Last run length: '+(lastCheck?Shelf.runLength(lastCheck.durationMs)+(lastCheck.partial?' · partial':''):'—');$('#lastRunLength').title=lastCheck?'Finished '+date(lastCheck.finishedAt):'The duration of your next finished check will appear here.';
  $('#lastRun').textContent='Last run: '+date(state.lastRun);$('#notifications').checked=state.notifications;
  const query=$('#search').value.toLowerCase(),filter=$('#filter').value;
  const games=state.games.filter(g=>!$('#categoryFilter').value||(g.category||'Games')===$('#categoryFilter').value).filter(g=>`${g.name} ${g.platform}`.toLowerCase().includes(query)).filter(g=>filter==='all'||(filter==='paused'?g.paused:filter==='active'?!g.paused:filter==='drop'?g.listings.some(l=>l.previous!=null&&l.cents<l.previous):g.listings.some(l=>['error','blocked','unavailable'].includes(l.status)))).sort((a,b)=>a.name.localeCompare(b.name));
  $('#grid').replaceChildren();$('#empty').hidden=state.games.length>0;
  for(const g of games){
    const tr=el('tr'),td=el('td');td.append(el('span','gameTitle',g.name),el('span','platform',(g.category||'Games')+(g.platform?' · '+g.platform:'')));if(g.targetPrice)td.append(el('span','platform','Target: '+Shelf.money(g.targetPrice.cents,g.targetPrice.currency)+' or less'));tr.append(td);
    if(g.paused)td.append(el('span','pausedBadge','Paused'));
    const lowest=g.paused?[]:Shelf.lowest(g.listings,state);
    for(const store of Shelf.visibleStores(state)){
      const td=el('td'),storeListings=g.listings.filter(l=>l.store===store.id);
      if(!storeListings.length){td.append(el('span','missing','— Not tracked'));tr.append(td);continue;}
      for(const [index,l] of storeListings.entries()){
      const best=lowest.includes(l.id);
      const unsuccessful=['error','blocked','unavailable'].includes(l.status);
      const out=l.stockState==='out'||(!l.stockState&&l.status==='unavailable'&&l.unavailableReason!=='no-featured-offer');
      const box=el('div','priceBox'+(out?' refreshFailed outOfStock':unsuccessful?' refreshFailed'+(l.status==='blocked'?' verificationNeeded':''):best?' cheapest':''));
      box.style.borderLeft='3px solid '+Shelf.storeColor(state,store.id);box.append(quickRemoveButton(l,g.name,store.name));
      const listingLink=link(l.url,Shelf.listingLabel(l,index),'listingLabel');listingLink.title=l.url;box.append(listingLink);
      box.append(link(l.url,Shelf.money(l.cents,l.currency),'price'));
      const delivered=Shelf.delivered(l);
      box.append(el('span','caption',delivered==null?'Delivery cost unknown':'Delivery '+Shelf.money(l.shippingCents,l.currency)+' · Total '+Shelf.money(delivered,l.currency)));
      if(delivered!=null&&l.currency!==state.baseCurrency){const total=Shelf.convert(delivered,l.currency,state);if(total!=null)box.append(el('span','caption','≈ '+Shelf.money(total,state.baseCurrency)+' delivered'));}
      if(g.paused)box.append(el('span','pausedBadge','Tracking paused'));
      if(l.currency!==state.baseCurrency){const converted=Shelf.convert(l.cents,l.currency,state);box.append(el('span','caption',converted==null?'Conversion unavailable · update rates':'≈ '+Shelf.money(converted,state.baseCurrency)+(state.manualRates?.[l.currency]?' · custom rate':' · reference rate')));}
      if(l.previous!=null&&l.cents!==l.previous){box.append(el('span','change '+(l.cents<l.previous?'down':'up'),`${l.cents<l.previous?'↓':'↑'} ${Shelf.money(Math.abs(l.cents-l.previous),l.currency)} from ${Shelf.money(l.previous,l.currency)}`));}
      box.append(el('span','caption',best?(state.compareDelivered?'Lowest delivered ':'Lowest comparable ')+state.baseCurrency:store.id==='cex'?'Pre-owned · retail price':store.id==='amazonUK'?l.currency+' · as displayed':'Listed item price'));
      box.append(el('span','caption',(l.status==='ok'?'Checked ':'Last good ')+date(l.checkedAt)));
      const stock=stockNote(l);if(stock)box.append(stock);
      if(l.stockWatch){
        const watch=el('span','caption','Watching stock'+(l.stockCheck?' · '+date(l.stockCheck.at):''));
        box.append(watch);
        if(latestStockIssue(l))box.append(el('span','warning',l.stockCheck.message||'Could not confirm stock.'));
      }
      if(l.status==='unavailable'&&l.stockState==='in')box.append(el('span','warning','Refresh for current price'));
      else if(l.status!=='ok'){const w=el('span','warning',l.error?.startsWith('Website access missing')?'Website access needed · click Refresh':l.status==='pending'?'Awaiting first price check':l.status==='blocked'?'Verification needed':l.status==='unavailable'?(l.unavailableReason==='no-featured-offer'?'No featured offer · old price':'Out of stock · old price'):'Could not refresh · old price');w.title=(l.error||'')+' Last attempt: '+date(l.lastAttempt);box.append(w);if(unsuccessful&&l.error)box.append(el('span','failureReason',l.error));}
      const refreshButton=refreshListingButton(l);refreshButton.disabled||=g.paused;box.append(refreshButton);td.append(box);
      }
      tr.append(td);
    }
    const action=el('td'),b=el('button','quiet','•••');b.title='Manage '+g.name;b.setAttribute('aria-label','Manage '+g.name);b.onclick=()=>manage(g.id);const retry=el('button','gameRefresh','↻ Refresh');retry.title='Refresh all listings for '+g.name;retry.dataset.paused=String(!!g.paused);retry.disabled=$('#check').disabled||g.paused;retry.onclick=()=>startCheck({gameId:g.id}).catch(e=>tell(e.message));action.append(retry,b);tr.append(action);$('#grid').append(tr);
  }
  if(state.games.length&&!games.length){const tr=el('tr'),td=el('td','muted','No products match your search or filter.');td.colSpan=Shelf.visibleStores(state).length+2;tr.append(td);$('#grid').append(tr);}
  $('#events').replaceChildren();
  const order=$('#eventSort').value,period=$('#eventPeriod').value,day=period==='today'?Shelf.localDay():period==='date'?$('#eventDate').value:'';
  const events=Shelf.sortedEvents(state.events,order,day);
  $('#eventNote').textContent=order==='drop'?'Largest reductions first, grouped by original currency. Showing up to 30 changes.':order==='percent'?'Largest percentage reductions first. Showing up to 30 changes.':'Showing the 30 most recent price and stock changes, including changes below your notification threshold.';
  if(order!=='newest')$('#eventNote').textContent+=' Stock changes follow price drops, newest first.';
  $('#eventNote').textContent+=(day?' Selected day: '+day+'.':' All retained history.');
  if(!events.length)$('#events').append(el('p','small',order==='newest'?'No price or stock changes for this period.':'No price drops or stock changes recorded for this period.'));
  let previousDay='';
  for(const e of events.slice(0,30)){
    const day=new Date(e.at).toLocaleDateString('en-IE',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
    if(day!==previousDay){$('#events').append(el('div','dateDivider',day));previousDay=day;}
    const stock=['out-of-stock','back-in-stock'].includes(e.type),best=!stock&&Shelf.isLowestEntry(state,e),row=el('div','event'+(best?' lowestSummary':''));row.style.borderLeft='3px solid '+Shelf.storeColor(state,e.store);
    const prices=el('span',stock?(e.type==='back-in-stock'?'down':'up'):e.price<e.old?'down':'up');
    if(stock)prices.textContent=e.type==='back-in-stock'?'Back in stock':'Out of stock';
    else prices.append(el('span','',Shelf.money(e.old,e.currency)+' → '),el('span',best?'summaryLowestPrice':'',Shelf.money(e.price,e.currency)));
    if(best)prices.append(el('small','lowestBadge',state.compareDelivered?'Lowest delivered total now':'Lowest in row now'));
    row.append(link(e.url,e.game+(e.platform?' · '+e.platform:'')),el('small','',Shelf.stores.find(s=>s.id===e.store)?.name||e.storeName||e.store),prices,el('small','',date(e.at)));$('#events').append(row);
  }
}
function showProgress(p){
  const total=Math.max(0,p?.total||0),done=Math.min(total,Math.max(0,p?.done||0)),percent=total?Math.round(done/total*100):0;
  document.querySelectorAll('.gameRefresh,.listingRefresh').forEach(b=>b.disabled=!!p?.running||b.dataset.paused==='true');
  $('#check').disabled=$('#checkStock').disabled=$('#retryFailures').disabled=!!p?.running;$('#scanEta').textContent=p?.running&&p.etaSeconds!=null?'About '+Math.max(1,Math.ceil(p.etaSeconds/60))+' min remaining':'';$('#stop').hidden=!p?.running;
  $('#progress').textContent=p?.label||'Ready';
  $('#progressCount').textContent=`${done} / ${total} processed · ${percent}%`;
  $('#progressBar').max=total||1;$('#progressBar').value=done;
  $('#progressBar').setAttribute('aria-valuetext',`${done} of ${total} listings processed`);
  $('#progressDetails').textContent=total?`${p.checked||0} refreshed · ${p.failed||0} unsuccessful attempts · ${p.skipped||0} skipped`:'Start a check to see its progress.';
}
function manage(id){
  manageId=id;const g=state.games.find(g=>g.id===id);if(!g)return;
  $('#pauseProduct').textContent=g.paused?'Resume tracking':'Pause / mark as purchased';
  $('#targetAmount').value=g.targetPrice?(g.targetPrice.cents/100).toFixed(2):'';$('#targetCurrency').value=g.targetPrice?.currency||state.baseCurrency;$('#targetMessage').textContent='';$('#editCategory').value=g.category||'Games';$('#editName').value=g.name;$('#editPlatform').value=g.platform;$('#manageMessage').textContent='';renderListingDetails(g);
  if(!$('#manageDialog').open)$('#manageDialog').showModal();
}
function renderListingDetails(g){
  $('#listingDetails').replaceChildren();
  for(const l of g.listings){
    const s=Shelf.stores.find(s=>s.id===l.store),section=el('div','listingDetail');
    section.append(el('strong','',`${s.name} · ${Shelf.money(l.cents,l.currency)}`),el('p','small',`${l.status} · ${l.source||'No reading yet'} · Last attempt: ${date(l.lastAttempt)}`));
    const stock=stockNote(l);if(stock)section.append(stock);
    if(l.error&&!(l.stockState==='in'&&l.status==='unavailable'))section.append(el('p','warning',l.error));
    const index=g.listings.filter(x=>x.store===l.store).findIndex(x=>x.id===l.id);
    section.style.borderLeft='3px solid '+Shelf.storeColor(state,s.id);section.append(link(l.url,Shelf.listingLabel(l,index)+' ↗'));
    section.append(el('p','listingUrl',l.url),refreshListingButton(l));
    if(l.stockWatch){
      section.append(refreshListingButton(l,'Check stock for this listing',true));
      if(l.stockCheck)section.append(el('p','small','Last stock check: '+date(l.stockCheck.at)+(l.stockCheck.message?' · '+l.stockCheck.message:'')));
    }
    const currencyLabel=el('label','','Listing currency'),currencySelect=el('select');
    for(const c of Shelf.currencies){const o=el('option','',Shelf.currencyLabel(c));o.value=c;currencySelect.append(o);}currencySelect.value=l.currency;
    currencySelect.onchange=async()=>{if(!confirm('Change currency and clear the current price? Earlier history will retain its original currency.')){currencySelect.value=l.currency;return;}try{await send({type:'listingCurrency',id:l.id,currency:currencySelect.value});await refresh();manage(g.id);}catch(e){$('#manageMessage').textContent=e.message;}};
    currencyLabel.append(currencySelect);section.append(currencyLabel);
    section.append(listingEditor(l),priceHistoryChart(l));
    const details=el('details'),ul=el('ul');details.append(el('summary','','Price history'));
    for(const h of [...(l.history||[])].reverse())ul.append(el('li','',`${date(h.at)} · ${Shelf.money(h.cents,h.currency||l.currency)}`));details.append(ul);section.append(details);
    const remove=el('button','danger','Remove listing');remove.onclick=async()=>{if(confirm(`Remove this ${s.name} listing?`)){try{await send({type:'removeListing',id:l.id});await refresh();manage(g.id);}catch(e){tell(e.message);}}};section.append(remove);$('#listingDetails').append(section);
  }
}
function showAdd(){
  urlSelectionManual=false;$('#urlSuggestion').textContent='';
  $('#urlForm').reset();$('#urlSort').value=state.productSort;$('#addError').textContent='';$('#urlNew').hidden=false;$('#urlName').required=true;
  $('#urlGame').replaceChildren();const o=el('option','','＋ New product');o.value='';$('#urlGame').append(o);
  for(const g of Shelf.sortedProducts(state.games,state.productSort)){const o=el('option','',g.name+(g.platform?' · '+g.platform:''));o.value=g.id;$('#urlGame').append(o);}
  $('#addDialog').showModal();
}
function renderStoreManager(){
  const root=$('#storeManager');root.replaceChildren();
  for(const s of Shelf.visibleStores(state)){
    const hidden=state.hiddenStores?.includes(s.id),row=el('div','storeSetting');
    row.append(el('strong','',s.name+(hidden?' · deleted':'')));
    row.append(el('small','',[s.host+(s.pathPrefix||''),s.region,s.currency].filter(Boolean).join(' · ')));
    for(const [label,direction] of [['←',-1],['→',1]]){const move=el('button','',label);move.title='Move store '+(direction<0?'left':'right');move.onclick=async()=>{try{await send({type:'moveStore',id:s.id,direction});await refresh();renderStoreManager();}catch(e){$('#storeManagerMessage').textContent=e.message;}};row.append(move);}
    const edit=el('button','','Edit');edit.onclick=()=>{editingStore=s.id;$('#editStoreName').value=s.name;$('#editStoreRegion').value=s.region||'';$('#editStoreCurrency').value=s.currency;$('#editStoreError').textContent='';$('#editStoreDialog').showModal();};row.append(edit);
    const grant=el('button','','Allow website');grant.onclick=async()=>{try{const ok=await browser.permissions.request({origins:Shelf.origins(s)});$('#storeManagerMessage').textContent=ok?'Website access granted.':'Website access was declined.';}catch(e){$('#storeManagerMessage').textContent=e.message;}};row.append(grant);
    if(hidden){const restore=el('button','','Restore column');restore.onclick=async()=>{try{await send({type:'restoreStore',id:s.id});await refresh();renderStoreManager();}catch(e){$('#storeManagerMessage').textContent=e.message;}};row.append(restore);}
    else {
      const label=el('label','','Colour'),color=el('input');color.type='color';color.value=Shelf.storeColor(state,s.id);color.setAttribute('aria-label',s.name+' colour');
      color.onchange=async()=>{try{await send({type:'storeColor',id:s.id,color:color.value});await refresh();$('#storeManagerMessage').textContent=s.name+' colour saved.';}catch(e){$('#storeManagerMessage').textContent=e.message;}};label.append(color);row.append(label);
      const count=state.games.reduce((n,g)=>n+g.listings.filter(l=>l.store===s.id).length,0),remove=el('button','danger','Delete store');
      remove.onclick=async()=>{if(!confirm('Delete '+s.name+' and its '+count+' tracked listing(s), including their price histories? Product rows and Recent changes will remain.'))return;try{await send({type:'removeStore',id:s.id});await refresh();renderStoreManager();$('#storeManagerMessage').textContent=s.name+' deleted.';}catch(e){$('#storeManagerMessage').textContent=e.message;}};row.append(el('small','',count+' listings'),remove);
    }
    root.append(row);
  }
}
$('#manageStores').onclick=()=>{$('#storeManagerMessage').textContent='';renderStoreManager();$('#storesDialog').showModal();};
async function refresh(){const r=await send({type:'state'});state=r.state;removedListingTokens.splice(0,removedListingTokens.length,...(r.listingUndoTokens||[]));renderListingUndo();render();}
$('#eventDate').value=Shelf.localDay();
$('#eventPeriod').onchange=()=>{if($('#eventPeriod').value==='today')$('#eventDate').value=Shelf.localDay();render();};
$('#eventDate').onchange=()=>{if(!$('#eventDate').value)$('#eventDate').value=Shelf.localDay();$('#eventPeriod').value='date';render();};
$('#eventSort').value=localStorage.getItem('shelfEventSort')||'newest';
$('#eventSort').onchange=()=>{localStorage.setItem('shelfEventSort',$('#eventSort').value);render();};
$('#search').oninput=render;$('#filter').onchange=render;
$('#addStore').onclick=()=>{$('#storeForm').reset();$('#storeCurrency').value=state?.baseCurrency||'EUR';$('#storeError').textContent='';$('#storeDialog').showModal();};
$('#storeForm').onsubmit=async e=>{
  e.preventDefault();try{
    const store=Shelf.customStore({name:$('#storeName').value,url:$('#storeUrl').value,currency:$('#storeCurrency').value,region:$('#storeRegion').value,pathPrefix:$('#storePath').value});
    const known=Shelf.stores.find(s=>(s.host===store.host||'www.'+s.host===store.host)&&!store.pathPrefix);
    const staged=send({type:'stageStore',store});
    const allowed=await browser.permissions.request({origins:[...new Set(['https://'+store.host+'/*',...(known?Shelf.origins(known):[])])]});await staged;
    if(!allowed){await send({type:'cancelStore'});throw Error('Website access was not granted. No column was added.');}
    await send({type:'finishStore'});$('#storeDialog').close();await refresh();tell('Store ready. Open a listing and use Pick price on page from the toolbar.');
  }catch(e){$('#storeError').textContent=e.message;}
};
$('#addUrl').onclick=showAdd;$('#emptyAdd').onclick=showAdd;
$('#urlGame').onchange=()=>{urlSelectionManual=true;$('#urlNew').hidden=!!$('#urlGame').value;$('#urlName').required=!$('#urlGame').value;};
function suggestUrlGame(){
  if(urlSelectionManual)return;
  try {
    const url=new URL($('#url').value),store=Shelf.identify(url.href);
    const existing=state.games.find(g=>g.listings.some(l=>l.url===Shelf.canonical(url.href)));
    const slug=decodeURIComponent(url.pathname.split('/').filter(Boolean)[0]||'').replace(/-/g,' ');
    const title=$('#urlName').value.trim() || (store.id.startsWith('amazon')&&!/^(dp|gp)$/i.test(slug)?slug:'');
    const id=existing?.id || Shelf.suggestGame(title,state.games,store.id);
    const candidates=Shelf.gameSuggestions(title,state.games,store.id).slice(0,3);
    $('#urlGame').value=id;$('#urlNew').hidden=!!id;$('#urlName').required=!id;
    $('#urlSuggestion').textContent=existing?'Already tracked in '+existing.name+'. Adding again will keep the existing listing.':id?'Suggested row: '+state.games.find(g=>g.id===id).name+'. Check or change the selection before adding.':candidates.length?'Possible matches: '+candidates.map(c=>state.games.find(g=>g.id===c.id).name).join(' / ')+'. Choose a row above.':'Choose an existing product row or enter a name for suggestions.';
  }catch(e){$('#urlSuggestion').textContent='';}
}
$('#url').oninput=()=>{urlSelectionManual=false;suggestUrlGame();};
$('#urlName').oninput=suggestUrlGame;
$('#scanTime').oninput=$('#threshold').oninput=()=>{settingsDirty=true;};
$('#saveSettings').onclick=async()=>{
  if(!$('#scanTime').reportValidity()||!$('#threshold').reportValidity())return;
  try{await send({type:'settings',scanTime:$('#scanTime').value,notificationThreshold:Shelf.amount($('#threshold').value)});settingsDirty=false;await refresh();tell('Alert threshold saved in your preferred currency.');}catch(e){tell(e.message);}
};
$('#urlForm').onsubmit=async e=>{e.preventDefault();try{
const game=state.games.find(g=>g.id===$('#urlGame').value),warning=game?Shelf.variantWarning($('#urlName').value+' '+decodeURIComponent(new URL($('#url').value).pathname).replace(/-/g,' '),game):'';
if(warning&&!confirm(warning+' Add anyway?'))return;
const watch=$('#urlStockWatch').checked;
const result=await send({type:'add',url:$('#url').value,gameId:$('#urlGame').value,name:$('#urlName').value,platform:$('#urlPlatform').value,category:$('#urlCategory').value,...(watch?{stockWatch:true}:{})});$('#addDialog').close();await refresh();tell(result.updated?(watch?'Stock watch enabled.':'Already tracked — kept the existing listing and history.'):(watch?'Listing added. Choose Check stock to confirm availability.':'Listing added. Click Check prices to collect its first price.'));}catch(e){$('#addError').textContent=e.message;}};
$('#renameForm').onsubmit=async e=>{e.preventDefault();try{await send({type:'rename',id:manageId,name:$('#editName').value,platform:$('#editPlatform').value,category:$('#editCategory').value});await refresh();$('#manageDialog').close();}catch(e){tell(e.message);}};
$('#delete').onclick=async()=>{if(confirm('Delete this product row and all its listings and price history?')){try{await send({type:'removeGame',id:manageId});$('#manageDialog').close();await refresh();}catch(e){tell(e.message);}}};
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>document.getElementById(b.dataset.close).close());
// Dismiss only a click that starts and ends on the backdrop, not a drag
// from a field or a click in the dialog padding/scrollbar.
{
  const dialog=$('#manageDialog');let startedOutside=false;
  const outside=e=>{const r=dialog.getBoundingClientRect();return e.target===dialog&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom);};
  dialog.addEventListener('pointerdown',e=>{startedOutside=e.button===0&&outside(e);});
  dialog.addEventListener('click',e=>{if(startedOutside&&outside(e))dialog.close();startedOutside=false;});
  dialog.addEventListener('pointercancel',()=>{startedOutside=false;});
  dialog.addEventListener('close',()=>{startedOutside=false;});
}
$('#check').onclick=()=>startCheck().catch(e=>tell(e.message));
$('#checkStock').onclick=()=>startCheck({stockOnly:true}).catch(e=>tell(e.message));
$('#stop').onclick=()=>send({type:'stop'}).catch(e=>tell(e.message));
$('#test').onclick=()=>send({type:'test'}).then(r=>tell(r.ok?'Test alert sent. If it is hidden, check Firefox/Windows notification settings.':'Notification failed.')).catch(e=>tell(e.message));
$('#notifications').onchange=()=>send({type:'notifications',enabled:$('#notifications').checked}).catch(e=>tell(e.message));
$('#export').onclick=async()=>{try{await refresh();const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=`game-shelf-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);tell('Backup downloaded. Keep it before removing or reinstalling the temporary add-on.');}catch(e){tell(e.message);}};
$('#import').onclick=()=>$('#file').click();
$('#file').onchange=async()=>{try{const file=$('#file').files[0];if(!file)return;if(file.size>10000000)throw Error('Backup is too large (10 MB maximum).');const data=JSON.parse(await file.text());Shelf.validateBackup(data);if(!confirm('Replace your current watchlist with this backup? Export your current list first if needed.'))return;await send({type:'import',data});removedListingTokens.length=0;renderListingUndo();await refresh();tell('Backup restored. Prices will be refreshed on the next check.');}catch(e){tell(e.message);}finally{$('#file').value='';}};
browser.storage.onChanged.addListener((changes,area)=>{if(area!=='local')return;if(changes.shelf){state=changes.shelf.newValue;render();if($('#manageDialog').open){const g=state.games.find(g=>g.id===manageId);if(g){if(!document.querySelector('#listingDetails .listingEditor[data-dirty="true"]'))renderListingDetails(g);}else $('#manageDialog').close();}}if(changes.progress)showProgress(changes.progress.newValue);if(changes.runError)tell(changes.runError.newValue);if(changes.notificationError)tell('Notification error: '+changes.notificationError.newValue);});
(async()=>{try{await refresh();const r=await browser.storage.local.get('progress');showProgress(r.progress);}catch(e){tell(e.message);}})();

// A fixed copy avoids overflow-x containers trapping CSS sticky headers.
const headerDock=el('div','storeHeaderDock');headerDock.hidden=true;headerDock.setAttribute('aria-hidden','true');document.body.append(headerDock);
function syncStoreHeader(){
  const wrap=$('.tableWrap'),table=wrap.querySelector('table'),head=table.tHead;
  const box=wrap.getBoundingClientRect(),rect=head.getBoundingClientRect();
  syncStoreScroll(box);
  headerDock.hidden=!(rect.top<0 && box.bottom>rect.height);
  if(headerDock.hidden)return;
  headerDock.style.left=box.left+'px';headerDock.style.width=box.width+'px';
  const copy=el('table'),cloned=head.cloneNode(true);
  cloned.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));
  const cells=head.querySelectorAll('th');
  cloned.querySelectorAll('th').forEach((n,i)=>{const width=cells[i].getBoundingClientRect().width+'px';n.style.width=width;n.style.minWidth=width;n.style.maxWidth=width;});
  copy.style.width=table.getBoundingClientRect().width+'px';copy.style.tableLayout='fixed';copy.append(cloned);headerDock.replaceChildren(copy);headerDock.scrollLeft=wrap.scrollLeft;
}
let headerFrame;
function queueHeader(){if(headerFrame)return;headerFrame=requestAnimationFrame(()=>{headerFrame=null;syncStoreHeader();});}
window.addEventListener('scroll',queueHeader,{passive:true});window.addEventListener('resize',queueHeader);
$('.tableWrap').addEventListener('scroll',queueHeader,{passive:true});
new ResizeObserver(queueHeader).observe($('.tableWrap'));
new MutationObserver(queueHeader).observe($('#storeHeaders'),{childList:true});
// Today follows the local calendar if the dashboard stays open overnight.
let shownDay=Shelf.localDay();setInterval(()=>{const day=Shelf.localDay();if(day!==shownDay){shownDay=day;if(state)render();}},30000);

// A visible range control remains usable even when the OS hides native scrollbars.
const scrollWrap=$('.tableWrap'),scrollControls=$('#storeScrollControls'),scrollRange=$('#storeScrollRange');
function syncStoreScroll(box=scrollWrap.getBoundingClientRect()){
  const max=Math.max(0,scrollWrap.scrollWidth-scrollWrap.clientWidth),needed=max>1;
  const slot=$('#storeScrollSlot');slot.style.height=needed?'56px':'0px';
  const slotRect=slot.getBoundingClientRect(),floating=needed && slotRect.bottom<0 && box.bottom>70 && box.top<window.innerHeight;
  scrollControls.hidden=!needed;
  scrollControls.classList.toggle('floating',floating);
  scrollControls.style.left=floating?Math.max(8,box.left)+'px':'';
  scrollControls.style.width=floating?Math.min(box.width,window.innerWidth-16)+'px':'';
  scrollRange.max=String(max);scrollRange.value=String(scrollWrap.scrollLeft);
  scrollRange.setAttribute('aria-valuetext',max?Math.round(scrollWrap.scrollLeft/max*100)+'% across stores':'All stores visible');
  $('#storesLeft').disabled=scrollWrap.scrollLeft<=1;$('#storesRight').disabled=scrollWrap.scrollLeft>=max-1;
}
scrollRange.oninput=()=>{scrollWrap.scrollLeft=Number(scrollRange.value);queueHeader();};
$('#storesLeft').onclick=()=>{scrollWrap.scrollLeft-=Math.max(150,scrollWrap.clientWidth/2);queueHeader();};
$('#storesRight').onclick=()=>{scrollWrap.scrollLeft+=Math.max(150,scrollWrap.clientWidth/2);queueHeader();};

let editingStore=null;
for(const id of ['storeCurrency','baseCurrency','editStoreCurrency'])for(const c of Shelf.currencies){const o=el('option','',Shelf.currencyLabel(c));o.value=c;$('#'+id).append(o);}
$('#editStoreForm').onsubmit=async e=>{e.preventDefault();try{await send({type:'editStore',id:editingStore,name:$('#editStoreName').value,region:$('#editStoreRegion').value,currency:$('#editStoreCurrency').value});$('#editStoreDialog').close();await refresh();renderStoreManager();}catch(e){$('#editStoreError').textContent=e.message;}};

function showRateStatus(){
  const entries=Object.values(state.exchangeRates||{}),dates=entries.map(r=>r.date).filter(Boolean).sort();
  $('#rateStatus').textContent=state.fxError || (state.fxMode==='manual'?'Manual mode: custom rates apply until removed.':state.fxUpdatedAt?'Last downloaded: '+date(state.fxUpdatedAt)+(dates.length?' · Reference dates: '+dates[0]+(dates.at(-1)!==dates[0]?' to '+dates.at(-1):''):'')+' · '+entries.length+' currencies.':'Automatic rates will download shortly.');
}
$('#internationalSettings').onclick=()=>{
  $('#baseCurrency').value=state.baseCurrency;$('#fxMode').value=state.fxMode||'auto';
  const rates=state.manualRates||{};$('#exchangeRates').value=Object.entries(rates).map(([c,r])=>c+'='+r.value).join('\n');$('#currencyError').textContent='';
  $('#customRateDetails').open=state.fxMode==='manual';showRateStatus();$('#currencyDialog').showModal();
};
$('#baseCurrency').onchange=()=>{$('#exchangeRates').value='';$('#rateStatus').textContent='Save to fetch rates for the new preferred currency.';};
$('#fxMode').onchange=()=>{$('#customRateDetails').open=$('#fxMode').value==='manual';};
$('#refreshRates').onclick=async()=>{
  if($('#baseCurrency').value!==state.baseCurrency||$('#fxMode').value!==state.fxMode){$('#currencyError').textContent='Save changed settings before refreshing rates.';return;}
  $('#refreshRates').disabled=true;$('#currencyError').textContent='';try{await send({type:'refreshRates'});await refresh();showRateStatus();}catch(e){$('#currencyError').textContent=e.message;}finally{$('#refreshRates').disabled=false;}
};
$('#currencyForm').onsubmit=async e=>{e.preventDefault();try{
  const rates={};for(const line of $('#exchangeRates').value.split(/\n/).map(s=>s.trim()).filter(Boolean)){
    const match=line.match(/^([A-Za-z]{3})\s*=\s*(\d+(?:\.\d+)?)$/);if(!match)throw Error('Use one rate per line, for example GBP=1.18.');
    const c=match[1].toUpperCase();if(c in rates)throw Error('Duplicate rate for '+c);rates[c]=Number(match[2]);
  }
  await send({type:'internationalSettings',baseCurrency:$('#baseCurrency').value,fxMode:$('#fxMode').value,rates});$('#currencyDialog').close();await refresh();tell('Currency settings saved. Automatic rates refresh in the background.');
}catch(e){$('#currencyError').textContent=e.message;}};
for(const id of ['urlCategory','editCategory','categoryFilter'])for(const c of Shelf.categories){const o=el('option','',c);o.value=c;$('#'+id).append(o);}
$('#categoryFilter').onchange=render;
$('#urlSort').onchange=async()=>{try{const selected=$('#urlGame').value;await send({type:'productSort',value:$('#urlSort').value});state.productSort=$('#urlSort').value;const select=$('#urlGame');select.replaceChildren();const fresh=el('option','','＋ New product');fresh.value='';select.append(fresh);for(const g of Shelf.sortedProducts(state.games,state.productSort)){const o=el('option','',g.name+(g.platform?' · '+g.platform:''));o.value=g.id;select.append(o);}select.value=selected;}catch(e){$('#addError').textContent=e.message;}};
const weekdays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
for(const day of [1,2,3,4,5,6,0]){const label=el('label','toggle',weekdays[day]),input=el('input');input.type='checkbox';input.value=day;label.prepend(input);$('#dayChoices').append(label);}
function scheduleFromForm(){const mode=$('#scheduleMode').value;if(mode==='interval')return {mode,hours:$('#scheduleHours').valueAsNumber};return {mode,startDate:$('#scheduleStart').value,times:mode==='manual'?[]:[$('#scheduleTime1').value,...(mode==='twiceDaily'||(mode==='custom'&&$('#customSecond').checked)?[$('#scheduleTime2').value]:[])],days:Array.from(document.querySelectorAll('#dayChoices input:checked'),n=>Number(n.value))};}
function updateScheduleForm(){
  const mode=$('#scheduleMode').value;
  $('#intervalFields').hidden=$('#scheduleHours').disabled=mode!=='interval';
  $('#scheduledFields').hidden=mode==='manual'||mode==='interval';$('#scheduleDays').hidden=['manual','daily','twiceDaily'].includes(mode);$('#secondTimeLabel').hidden=!(mode==='twiceDaily'||mode==='custom'&&$('#customSecond').checked);$('#customSecondLabel').hidden=mode!=='custom';
  try{const next=Shelf.nextScheduled(Date.now(),scheduleFromForm());$('#schedulePreview').textContent=next?'Next check: '+new Date(next).toLocaleString():editingStockSchedule?'Choose Check stock to run a stock check manually.':'Choose Check prices to run a price check manually.';}catch(e){$('#schedulePreview').textContent=e.message;}
}
function openSchedule(stockOnly){
  editingStockSchedule=stockOnly;
  $('#intervalMode').hidden=$('#intervalMode').disabled=!stockOnly;
  $('#scheduleTitle').textContent=stockOnly?'Stock check schedule':'Price check schedule';
  const plan=stockOnly?state.stockPlan:state.scanPlan,times=plan.times||[];
  $('#scheduleMode').value=plan.mode;$('#scheduleHours').value=plan.hours||1;
  $('#scheduleStart').value=plan.startDate||'';$('#scheduleTime1').value=times[0]||(stockOnly?'09:00':'22:00');$('#scheduleTime2').value=times[1]||(stockOnly?'18:00':'10:00');$('#customSecond').checked=times.length>1;
  $('#dayChoices').querySelectorAll('input').forEach(n=>n.checked=(plan.days||[]).includes(Number(n.value)));$('#scheduleError').textContent='';updateScheduleForm();$('#scheduleDialog').showModal();
}
$('#editSchedule').onclick=()=>openSchedule(false);
$('#editStockSchedule').onclick=()=>openSchedule(true);
$('#scheduleMode').onchange=()=>{const mode=$('#scheduleMode').value;if(mode==='weekly'||mode==='twiceWeekly')$('#dayChoices').querySelectorAll('input').forEach(n=>n.checked=Number(n.value)===1||(mode==='twiceWeekly'&&Number(n.value)===4));updateScheduleForm();};
$('#scheduleForm').addEventListener('input',updateScheduleForm);
$('#scheduleForm').onsubmit=async e=>{e.preventDefault();const stockOnly=editingStockSchedule;try{const plan=Shelf.validateSchedule(scheduleFromForm(),stockOnly);await send({type:'scheduleSettings',plan,stockOnly});$('#scheduleDialog').close();await refresh();tell(stockOnly?'Stock check schedule saved.':'Price check schedule saved.');}catch(e){$('#scheduleError').textContent=e.message;}};

function applyTheme(value){
  const theme=Shelf.validTheme(value),rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
  const [r,g,b]=rgb(theme.background),light=(r*.299+g*.587+b*.114)>155;
  const root=document.documentElement.style;
  root.setProperty('--bg',theme.background);root.setProperty('--green',theme.accent);
  root.setProperty('--panel',theme.tile);root.setProperty('--line',light?'#c7ced0':'#2c3830');root.setProperty('--text',light?'#17251d':'#eff4ef');root.setProperty('--muted',light?'#4d6054':'#a1b1a5');
  const foreground=hex=>{const channels=rgb(hex).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722>.179?'#000000':'#ffffff';};
  const mix=(a,b,t)=>'#'+rgb(a).map((v,i)=>Math.round(v*(1-t)+rgb(b)[i]*t).toString(16).padStart(2,'0')).join('');
  const tileText=foreground(theme.tile);
  root.setProperty('--tileText',tileText);root.setProperty('--tileMuted',mix(theme.tile,tileText,.78));
  root.setProperty('--tileLine',mix(theme.tile,tileText,.28));root.setProperty('--tileHeader',mix(theme.tile,tileText,.08));
  const best=mix(theme.tile,theme.accent,.14);root.setProperty('--bestBackground',best);root.setProperty('--bestText',foreground(best));
  root.setProperty('--outOfStockBackground',theme.outOfStock);root.setProperty('--outOfStockText',foreground(theme.outOfStock));
  root.setProperty('--accentText',foreground(theme.accent));document.body.classList.toggle('lightTheme',light);
}
$('#help').onclick=()=>send({type:'help'}).catch(e=>tell(e.message));
$('#notifyIncreases').onchange=()=>send({type:'notifyIncreases',enabled:$('#notifyIncreases').checked}).catch(e=>tell(e.message));
async function backupStatus(){const {backupStatus:s}=await send({type:'backupStatus'});$('#backupStatus').textContent=s?(s.status||'')+(s.completedAt?' · Last saved '+new Date(s.completedAt).toLocaleString():'')+(s.filename?' · '+s.filename:''):'No automatic backup has been saved yet.';}
$('#preferences').onclick=()=>{const theme=Shelf.validTheme(state.theme),backup=Shelf.validBackupSettings(state.backup);$('#accentColor').value=theme.accent;$('#backgroundColor').value=theme.background;$('#tileColor').value=theme.tile;$('#outOfStockColor').value=theme.outOfStock;$('#backupEnabled').checked=backup.enabled;$('#backupFrequency').value=backup.frequency;$('#backupFolder').value=backup.folder;$('#preferencesMessage').textContent='';backupStatus().catch(e=>$('#preferencesMessage').textContent=e.message);$('#preferencesDialog').showModal();};
$('#appearanceForm').onsubmit=async e=>{e.preventDefault();try{await send({type:'theme',theme:{accent:$('#accentColor').value,background:$('#backgroundColor').value,tile:$('#tileColor').value,outOfStock:$('#outOfStockColor').value}});await refresh();$('#preferencesMessage').textContent='Grid colours saved.';}catch(e){$('#preferencesMessage').textContent=e.message;}};
$('#resetColours').onclick=async()=>{try{await send({type:'theme',theme:{}});await refresh();$('#accentColor').value=state.theme.accent;$('#backgroundColor').value=state.theme.background;$('#tileColor').value=state.theme.tile;$('#outOfStockColor').value=state.theme.outOfStock;}catch(e){$('#preferencesMessage').textContent=e.message;}};
$('#backupForm').onsubmit=async e=>{e.preventDefault();try{const config=Shelf.validBackupSettings({enabled:$('#backupEnabled').checked,frequency:$('#backupFrequency').value,folder:$('#backupFolder').value});if(config.enabled&&!await browser.permissions.request({permissions:['downloads']}))throw Error('Downloads permission was not granted.');await send({type:'backupSettings',config});await refresh();$('#preferencesMessage').textContent='Backup settings saved.';if(config.enabled)await send({type:'backupNow'});await backupStatus();}catch(e){$('#preferencesMessage').textContent=e.message;}};
$('#backupNow').onclick=async()=>{try{if(!await browser.permissions.request({permissions:['downloads']}))throw Error('Downloads permission was not granted.');await send({type:'backupNow'});await backupStatus();}catch(e){$('#preferencesMessage').textContent=e.message;}};
browser.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.backupStatus&&$('#preferencesDialog').open)backupStatus().catch(()=>{});});

for(const c of Shelf.currencies){const o=el('option','',Shelf.currencyLabel(c));o.value=c;$('#targetCurrency').append(o);}
$('#targetForm').onsubmit=async e=>{e.preventDefault();try{const value=$('#targetAmount').value.trim(),cents=value===''?null:Shelf.amount(value);if(value!==''&&cents==null)throw Error('Enter a valid target amount.');await send({type:'targetPrice',id:manageId,cents,currency:$('#targetCurrency').value});await refresh();$('#targetMessage').textContent=cents==null?'Target alert disabled.':'Target saved. It will be checked on the next successful listing refresh.';}catch(e){$('#targetMessage').textContent=e.message;}};


// Tracking upgrades
function renderUpgradeSettings(){
  $('#notificationMode').value=state.notificationMode||'individual';$('#stockAlerts').checked=!!state.stockAlerts;$('#outOfStockAlerts').checked=!!state.outOfStockAlerts;$('#notifyScanFailures').checked=state.notifyScanFailures!==false;
  $('#stockWatchAlerts').checked=state.stockWatchAlerts!==false;
  $('#learnPrices').checked=state.learnPrices!==false;$('#priceRulesCount').textContent=(state.sitePriceRules||[]).length+' learned store layouts';
  $('#foregroundScans').checked=!!state.foregroundScans;$('#retryFailed').checked=!!state.retryFailed;$('#compareDelivered').checked=!!state.compareDelivered;
  $('#notificationMode').disabled=$('#stockWatchAlerts').disabled=$('#stockAlerts').disabled=$('#outOfStockAlerts').disabled=$('#notifyScanFailures').disabled=!state.notifications;
  const issues=state.games.filter(g=>!g.paused).flatMap(g=>g.listings.filter(l=>['blocked','error'].includes(l.status)).map(l=>({g,l})));
  const issueBox=$('#scanIssues');issueBox.replaceChildren();issueBox.hidden=!issues.length;
  for(const status of ['blocked','error']){
    const group=issues.filter(f=>f.l.status===status);if(!group.length)continue;
    const verification=status==='blocked',panel=el('section','scanIssues'+(verification?' verificationNotice':''));
    panel.append(el('h3','',group.length+(verification?' listing'+(group.length===1?'':'s')+' need verification':' price check'+(group.length===1?'':'s')+' failed')));
    panel.append(el('p','',verification?'Open an affected listing, complete the store verification, then choose Retry failed. Last known prices are retained.':'Open an affected listing to check its price selection or website access, then choose Retry failed. Last known prices are retained.'));
    const stores=new Map();for(const f of group)if(!stores.has(f.l.store))stores.set(f.l.store,f);
    const links=el('div','issueLinks');for(const f of Array.from(stores.values()).slice(0,8))links.append(link(f.l.url,'Open '+(Shelf.stores.find(s=>s.id===f.l.store)?.name||f.l.store)+' ↗'));
    panel.append(links);if(stores.size>8)panel.append(el('p','','Use Needs attention to see the remaining stores.'));
    issueBox.append(panel);
  }
  const root=$('#lastSummary');root.replaceChildren();
  const summary=state.lastSummary;
  if(!summary)root.append(el('p','','No saved alerts yet. The next scan with matching alerts will create a summary in either notification mode.'));
  else{root.append(el('p','',date(summary.at)+(summary.inProgress?' · Scan in progress':summary.interrupted?' · Interrupted scan':summary.partial?' · Partial scan':'')));for(const item of summary.items){
    const best=Shelf.isLowestEntry(state,item),row=el('div','summaryEntry'+(best?' lowestSummary':''));row.append(el('strong','',item.title),el('p','',item.message));
    if(best)row.append(el('span','summaryLowestPrice',Shelf.money(item.cents,item.currency)),el('small','lowestBadge',state.compareDelivered?'Lowest delivered total now':'Lowest in row now'));
    root.append(row);
  }}
}
for(const id of ['notificationMode','stockWatchAlerts','stockAlerts','outOfStockAlerts','retryFailed','compareDelivered','notifyScanFailures','foregroundScans','learnPrices'])$('#'+id).onchange=async()=>{
  try{await send({type:'trackingSettings',[id]:id==='notificationMode'?$('#'+id).value:$('#'+id).checked});await refresh();}catch(e){tell(e.message);}
};
$('#retryFailures').onclick=()=>startCheck({failedOnly:true}).catch(e=>tell(e.message));
$('#pauseProduct').onclick=async()=>{try{const g=state.games.find(g=>g.id===manageId);await send({type:'pauseProduct',id:g.id,paused:!g.paused});await refresh();manage(g.id);}catch(e){$('#manageMessage').textContent=e.message;}};
function listingEditor(l){
  const form=el('form','listingEditor'),label=el('label','','Platform / edition / condition / size'),details=el('input');
  details.value=l.details||'';details.maxLength=160;details.placeholder='Xbox Series X · Day One · New';label.append(details);
  const deliveryLabel=el('label','','Delivery cost ('+l.currency+') — blank means unknown'),shipping=el('input');
  shipping.type='number';shipping.min='0';shipping.max='1000000';shipping.step='0.01';shipping.placeholder='0.00 for free delivery';
  shipping.value=l.shippingCurrency===l.currency&&l.shippingCents!=null?(l.shippingCents/100).toFixed(2):'';deliveryLabel.append(shipping);
  const stockLabel=el('label','toggle','Watch stock'),watch=el('input');
  watch.type='checkbox';watch.checked=!!l.stockWatch;stockLabel.prepend(watch);
  const button=el('button','','Save listing details');button.type='submit';
  form.append(label,deliveryLabel,stockLabel,button);
  form.addEventListener('input',()=>{form.dataset.dirty='true';});
  form.onsubmit=async e=>{e.preventDefault();try{await send({type:'listingDetails',id:l.id,details:details.value,shippingCents:shipping.value===''?null:Shelf.amount(shipping.value,l.currency),stockWatch:watch.checked});form.dataset.dirty='false';await refresh();const g=state.games.find(g=>g.id===manageId);if(g&&!document.querySelector('#listingDetails .listingEditor[data-dirty="true"]'))renderListingDetails(g);$('#manageMessage').textContent='Listing details saved.';}catch(e){$('#manageMessage').textContent=e.message;}};
  return form;
}
function priceHistoryChart(l){
  const root=el('section','priceHistoryChart');root.append(el('h3','','Price history'));
  const series=Shelf.historySeries(l);
  if(!series.length){root.append(el('p','','The first successful check starts this chart.'));return root;}
  const svgNode=(tag,attrs)=>{const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value] of Object.entries(attrs||{}))n.setAttribute(key,value);return n;};
  for(const {currency,points} of series){
    const low=Math.min(...points.map(p=>p.cents)),high=Math.max(...points.map(p=>p.cents)),first=points[0].at,last=points.at(-1).at;
    const drops=points.filter((p,i)=>i&&p.cents<points[i-1].cents);
    root.append(el('p','small',currency+' · Lowest recorded '+Shelf.money(low,currency)+' · Last drop '+(drops.length?date(drops.at(-1).at):'None recorded')));
    const svg=svgNode('svg',{viewBox:'0 0 480 180',role:'img','aria-label':currency+' price history from '+date(first)+' to '+date(last)});
    const coords=points.map(p=>[45+(p.at-first)/Math.max(1,last-first)*420,130-(p.cents-low)/Math.max(1,high-low)*105]);
    svg.append(svgNode('polyline',{points:coords.map(c=>c.join(',')).join(' '),fill:'none',stroke:'currentColor','stroke-width':2}));
    points.forEach((p,i)=>{const dot=svgNode('circle',{cx:coords[i][0],cy:coords[i][1],r:4,fill:'currentColor',tabindex:0});const title=svgNode('title');title.textContent=date(p.at)+' · '+Shelf.money(p.cents,currency);dot.append(title);svg.append(dot);});
    for(const [x,y,txt] of [[4,18,Shelf.money(high,currency)],[4,149,Shelf.money(low,currency)],[45,174,new Date(first).toLocaleDateString()],[330,174,new Date(last).toLocaleDateString()]]){const t=svgNode('text',{x,y,fill:'currentColor','font-size':11});t.textContent=txt;svg.append(t);}
    root.append(svg);
  }
  root.append(el('p','small','Recorded item-price changes only; delivery excluded. Hover or focus a point for its date and price. The full list is below.'));
  return root;
}

$('#clearPriceRules').onclick=async()=>{if(!confirm('Forget all learned store layouts? Individual listing price selections will remain.'))return;try{await send({type:'clearPriceRules'});await refresh();}catch(e){tell(e.message);}};

// Two-axis middle-click autoscroll over the horizontally scrollable price grid.
function installGridAutoscroll(wrap){
  let active=null,frame=null,lastTime=null,suppressAux=false;
  const speed=d=>Math.abs(d)<12?0:Math.sign(d)*Math.min(35,(Math.abs(d)-12)*.12);
  function stop(){if(!active)return;active.marker.remove();active=null;lastTime=null;if(frame!=null)cancelAnimationFrame(frame);frame=null;document.body.classList.remove('gridAutoscrolling');}
  function tick(time){
    if(!active)return;
    const factor=lastTime==null?1:Math.min(50,time-lastTime)/16.67;lastTime=time;
    wrap.scrollLeft+=speed(active.x-active.startX)*factor;
    window.scrollBy(0,speed(active.y-active.startY)*factor);
    frame=requestAnimationFrame(tick);
  }
  document.addEventListener('mousedown',e=>{
    if(active){e.preventDefault();e.stopImmediatePropagation();suppressAux=e.button===1;stop();return;}
    if(e.button!==1||!wrap.contains(e.target)||e.target.closest('a,button,input,select,textarea,[contenteditable],dialog'))return;
    e.preventDefault();suppressAux=true;
    const marker=el('div','gridAutoscrollAnchor','✥');marker.setAttribute('aria-hidden','true');marker.style.left=e.clientX+'px';marker.style.top=e.clientY+'px';document.body.append(marker);
    active={startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY,marker};document.body.classList.add('gridAutoscrolling');frame=requestAnimationFrame(tick);
  },true);
  document.addEventListener('mousemove',e=>{if(active){active.x=e.clientX;active.y=e.clientY;}},{passive:true});
  document.addEventListener('auxclick',e=>{if(e.button===1&&suppressAux){e.preventDefault();suppressAux=false;}},true);
  document.addEventListener('keydown',e=>{if(active&&e.key==='Escape'){e.preventDefault();stop();}},true);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  window.addEventListener('blur',stop);window.addEventListener('pagehide',stop);
}
installGridAutoscroll(scrollWrap);
