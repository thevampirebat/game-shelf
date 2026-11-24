/*
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at https://mozilla.org/MPL/2.0/.
*/
const $=s=>document.querySelector(s);
const send=async m=>{const r=await browser.runtime.sendMessage(m);if(r?.error)throw Error(r.error);return r;};
let tab,reading,selector='',state;
const message=s=>$('#message').textContent=s;
function options(select,values,label=x=>x){select.replaceChildren();for(const value of values){const o=document.createElement('option');o.value=value;o.textContent=label(value);select.append(o);}}
options($('#category'),Shelf.categories);
options($('#storeCurrency'),Shelf.currencies,Shelf.currencyLabel);
function renderRows(selected=''){
  const select=$('#game');select.replaceChildren();const fresh=document.createElement('option');fresh.value='';fresh.textContent='＋ New product';select.append(fresh);
  for(const g of Shelf.sortedProducts(state.games,state.productSort)){const o=document.createElement('option');o.value=g.id;o.textContent=g.name+(g.platform?' · '+g.platform:'');select.append(o);}
  select.value=selected;$('#productSort').value=state.productSort;select.onchange();
}
function showStore(){
  $('#trackPanel').hidden=true;$('#storePanel').hidden=false;message('');
  try{const u=new URL(tab?.url);if(u.protocol==='https:'){$('#storeUrl').value=u.origin;$('#storeName').value=u.hostname.replace(/^www\./,'');}}catch{}
  $('#storeCurrency').value=state?.baseCurrency||'EUR';$('#storeName').focus();
}
$('#showStore').onclick=showStore;$('#addStoreHere').onclick=showStore;$('#help').onclick=()=>send({type:'help'}).then(()=>window.close()).catch(e=>message(e.message));
$('#cancelStore').onclick=()=>{$('#storePanel').hidden=true;$('#trackPanel').hidden=false;};
$('#open').onclick=()=>send({type:'open'}).then(()=>window.close()).catch(e=>message(e.message));
$('#game').onchange=()=>{$('#newFields').hidden=!!$('#game').value;$('#name').required=!$('#game').value;};
$('#productSort').onchange=async()=>{const selected=$('#game').value;try{await send({type:'productSort',value:$('#productSort').value});state.productSort=$('#productSort').value;renderRows(selected);}catch(e){message(e.message);}};
$('#pick').onclick=async()=>{try{await send({type:'pick',tabId:tab.id});window.close();}catch(e){message(e.message);}};
$('#addForm').onsubmit=async e=>{
  e.preventDefault();
  const chosen=state.games.find(g=>g.id===$('#game').value),warning=chosen?Shelf.variantWarning(reading.title,chosen):'';
  if(warning&&!confirm(warning+' Add anyway?'))return;
  $('#add').disabled=true;
  try{const raw=$('#deliveryCost').value.trim(),shippingCents=raw===''?null:Shelf.amount(raw);
  if(raw!==''&&!Shelf.validCost(shippingCents))throw Error('Enter a valid delivery cost.');
  const r=await send({type:'add',shippingCents,shippingCurrency:reading.currency,url:reading.url,gameId:$('#game').value,name:$('#name').value,category:$('#category').value,platform:$('#platform').value,selector,reading,stockWatch:$('#stockWatch').checked});message(r.updated?'Updated this listing.':'Added to your watchlist.');$('#add').textContent='Tracked ✓';}
  catch(e){message(e.message);$('#add').disabled=false;}
};
$('#quickStoreForm').onsubmit=async e=>{
  e.preventDefault();try{
    const store=Shelf.customStore({name:$('#storeName').value,url:$('#storeUrl').value,region:$('#storeRegion').value,pathPrefix:$('#storePath').value,currency:$('#storeCurrency').value});
    const known=Shelf.stores.find(s=>(s.host===store.host||'www.'+s.host===store.host)&&!store.pathPrefix);
    const origins=[...new Set(['https://'+store.host+'/*',...(known?Shelf.origins(known):[])])];
    const staged=send({type:'stageStore',store});
    const granted=await browser.permissions.request({origins});await staged;
    if(!granted){await send({type:'cancelStore'});throw Error('Website access was not granted.');}
    await send({type:'finishStore'});$('#storePanel').hidden=true;$('#trackPanel').hidden=false;await load();message('Store added. Confirm the price and choose a product below.');
  }catch(e){message(e.message);}
};
$('#amazonAuto').onclick=async()=>{
  try{const result=await send({type:'read',tabId:tab.id,automatic:true});if(reading?.currency!==result.reading.currency)$('#deliveryCost').value='';reading=result.reading;selector='';showReading();message('Automatic price selected. Click Update tracked listing or Track this product to save it.');}
  catch(e){message(e.message);}
};
function showReading(){
  $('#reading').classList.remove('found','attention');$('#reading').classList.add(reading.status==='ok'?'found':'attention');
  const soldOut=reading.status==='unavailable'&&reading.unavailableReason!=='no-featured-offer';
  $('#priceStatus').textContent=reading.status==='ok'?'✓ Price found':soldOut?'Out of stock':'Price not found';
  $('#priceAmount').textContent=reading.status==='ok'?Shelf.money(reading.cents,reading.currency)+' '+reading.currency:'';
  $('#priceTitle').textContent=reading.title;
  $('#priceDetail').textContent=reading.status==='ok'?reading.source:(reading.error||'Choose the selling price on this page.');
  $('#deliveryCurrency').textContent=reading.currency||'store currency';
}
async function load(){
  $('#amazonAuto').hidden=true;$('#deliveryCost').value='';$('#stockWatch').checked=false;
  $('#addStoreHere').hidden=true;reading=null;$('#add').disabled=true;$('#pick').disabled=true;$('#game').disabled=false;$('#add').textContent='Track this product';$('#reading').className='priceResult';$('#priceStatus').textContent='Reading this page…';$('#priceAmount').textContent='—';$('#priceTitle').textContent='';$('#priceDetail').textContent='';
  try{
    ({state}=await send({type:'state'}));if(state.storeAddStatus&&Date.now()-state.storeAddStatus.at<60000)message(state.storeAddStatus.message);Shelf.configureStores(state.customStores,state.storeOverrides);renderRows();
    [tab]=await browser.tabs.query({active:true,currentWindow:true});
    let store;try{store=Shelf.identify(tab.url);}catch{}
    if(!store||state.hiddenStores?.includes(store.id)){
      $('#reading').classList.add('attention');$('#priceStatus').textContent='Add a store to begin';$('#priceAmount').textContent='';$('#addStoreHere').hidden=false;$('#priceTitle').textContent='Save this website to start tracking its products.';$('#priceDetail').textContent='Track games, books, clothes, movies, toys and more.';return;
    }
    $('#amazonAuto').hidden=!store.id.startsWith('amazon');
    const url=Shelf.canonical(tab.url);$('#pick').disabled=false;
    const result=await send({type:'read',tabId:tab.id});reading=result.reading;selector=result.selector;
    if(!reading.url)throw Error(reading.error||'Open a product listing.');
    $('#name').value=reading.title||'';
    const existing=state.games.find(g=>g.listings.some(l=>l.url===reading.url));
    const saved=existing?.listings.find(l=>l.url===reading.url);
    $('#stockWatch').checked=!!saved?.stockWatch;
    if(saved?.shippingCents!=null&&saved.shippingCurrency===reading.currency)$('#deliveryCost').value=(saved.shippingCents/100).toFixed(2);
    $('#deliveryCurrency').textContent=reading.currency||store.currency;
    if(existing){message('Already tracked in '+existing.name+'. Saving updates this listing without duplicating it.');renderRows(existing.id);$('#game').disabled=true;$('#add').textContent='Update tracked listing';}
    else{const id=Shelf.suggestGame(reading.title,state.games,reading.store);if(id){renderRows(id);message('Suggested product selected. Check the selection before saving.');}}
    showReading();
    $('#add').disabled=false;
  }catch(e){$('#reading').classList.add('attention');$('#priceStatus').textContent='Needs attention';$('#priceAmount').textContent='—';$('#priceDetail').textContent=e.message;}
}
load();
