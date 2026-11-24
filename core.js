/*
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at https://mozilla.org/MPL/2.0/.
*/
/* Shared, dependency-free model and validation. */
globalThis.Shelf = (() => {
  const stores = [
    {id:'amazonIE', name:'Amazon IE', currency:'EUR', host:'amazon.ie'},
    {id:'amazonUK', name:'Amazon UK', currency:'EUR', host:'amazon.co.uk'},
    {id:'very', name:'Very', currency:'EUR', host:'very.ie'},
    {id:'smyths', name:'Smyths', currency:'EUR', host:'smythstoys.com'},
    {id:'cex', name:'CeX', currency:'EUR', host:'ie.webuy.com'}
  ];
  const currencies=['EUR','GBP','USD','CAD','AUD','NZD','JPY','ISK','TRY','CHF','NOK','SEK','DKK','PLN','CZK','HUF','RON','BGN','BRL','MXN','ZAR','INR','CNY','HKD','SGD','KRW','TWD','AED','SAR','ILS','THB','MYR','IDR','PHP','VND','CLP','COP','ARS'];
  currencies.sort();
  const defaults=stores.map(s=>({...s,region:s.id==='amazonUK'?'United Kingdom':'Ireland',pathPrefix:''}));
  const validCurrency=c=>currencies.includes(c);
  function scanPolicy(url){
    let host;try{host=new URL(url).hostname.toLowerCase();}catch{return {settleMs:0,minimumMs:0,verificationMs:0};}
    const boox=host==='boox.com'||host.endsWith('.boox.com'),smyths=host==='smythstoys.com'||host.endsWith('.smythstoys.com');
    return {settleMs:boox?1500:smyths?3000:0,minimumMs:boox?2500:smyths?10000:0,verificationMs:smyths?180000:0};
  }
  function validLastCheck(value,now=Date.now()){
    if(!value||!Number.isSafeInteger(value.startedAt)||!Number.isSafeInteger(value.finishedAt)||value.startedAt<=0||value.finishedAt<value.startedAt||value.finishedAt>now||!Number.isSafeInteger(value.durationMs)||value.durationMs!==value.finishedAt-value.startedAt)return null;
    return {startedAt:value.startedAt,finishedAt:value.finishedAt,durationMs:value.durationMs,partial:!!value.partial};
  }
  function runLength(ms){
    if(!Number.isSafeInteger(ms)||ms<0)return '—';
    const seconds=Math.ceil(ms/1000),hours=Math.floor(seconds/3600),minutes=Math.floor(seconds%3600/60),rest=seconds%60;
    return hours?hours+'h '+String(minutes).padStart(2,'0')+'m '+String(rest).padStart(2,'0')+'s':minutes?minutes+'m '+String(rest).padStart(2,'0')+'s':rest+'s';
  }
  function validPriceRules(rules){
    if(!Array.isArray(rules))return [];
    return rules.filter(r=>{
      try{return r&&new URL(r.origin).protocol==='https:'&&new URL(r.origin).origin===r.origin&&typeof r.store==='string'&&r.store.length<300&&validCurrency(r.currency)&&typeof r.selector==='string'&&r.selector.length<=500&&/^[a-zA-Z0-9_.# >\[\]="\'-]+$/.test(r.selector);}catch{return false;}
    }).slice(-200).map(r=>({origin:r.origin,store:r.store,currency:r.currency,selector:r.selector}));
  }
  function customStore(input) {
    const u=new URL(input.url || 'https://'+input.host);
    if(u.protocol!=='https:' || u.username || u.password || u.port || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(u.hostname) || u.hostname.endsWith('.localhost'))throw Error('Enter a public HTTPS store website.');
    const name=String(input.name||'').trim().slice(0,60);
    if(!name || !validCurrency(input.currency))throw Error('Enter a store name and choose a supported currency.');
    let pathPrefix=String(input.pathPrefix||'').trim();
    if(pathPrefix && (!pathPrefix.startsWith('/') || /[?#\\]/.test(pathPrefix)))throw Error('Region path must start with / and contain no query or fragment.');
    pathPrefix=pathPrefix.replace(/\/+$/,'');
    const id='custom:'+u.hostname+(pathPrefix?'|'+pathPrefix:'');
    return {id,host:u.hostname,name,currency:input.currency,region:String(input.region||'').trim().slice(0,60),pathPrefix,custom:true};
  }
  function configureStores(custom=[], overrides={}) {
    const base=defaults.map(d=>({...d,...overrides[d.id],id:d.id,host:d.host,custom:false}));
    const validated=custom.map(customStore),keys=new Set();
    for(const s of [...base,...validated]){
      if(!validCurrency(s.currency))throw Error('Unsupported store currency.');
      const key=s.host.replace(/^www\./,'')+'|'+(s.pathPrefix||'');
      if(keys.has(key))throw Error('This website and region path are already added.');keys.add(key);
    }
    stores.splice(0,stores.length,...base,...validated);
  }
  function convert(cents,from,state,now=Date.now()) {
    if(cents==null)return null;
    if(from===state.baseCurrency)return cents;
    const rate=state.manualRates?.[from] || (state.fxMode==='manual'?null:state.exchangeRates?.[from]);
    if(!rate || !Number.isFinite(rate.value) || rate.value<=0 || (rate.source!=='override' && now-rate.at>7*86400000))return null;
    return Math.round(cents*rate.value);
  }
  const validCost=n=>Number.isSafeInteger(n)&&n>=0&&n<=100000000;
  function delivered(l){return validCost(l.cents)&&validCost(l.shippingCents)&&l.shippingCurrency===l.currency?l.cents+l.shippingCents:null;}
  function scanListings(state,options={}){
    return state.games.filter(g=>!g.paused&&(!options.gameId||g.id===options.gameId)).flatMap(g=>g.listings.filter(l=>(!options.listingId||l.id===options.listingId)&&(!options.stockOnly||l.stockWatch===true)&&(!options.failedOnly||['error','blocked','unavailable'].includes(l.status))).map(l=>({...l,game:g.name})));
  }
  function availabilityState(value){
    const name=String(value||'').replace(/[^a-z]/gi,'').toLowerCase();
    if(['outofstock','soldout','discontinued'].includes(name))return 'out';
    if(['instock','available','availablefororder'].includes(name))return 'in';
    return 'unknown';
  }
  const validStockSince=(at,now=Date.now())=>Number.isSafeInteger(at)&&at>0&&at<=now;
  function stockChange(l,reading,at=Date.now()){
    const available=availabilityState(reading.availability);
    if(reading.unavailableReason==='no-featured-offer')return false;
    if(reading.status==='unavailable'||(reading.status==='ok'&&available==='out')){
      if(l.stockState!=='out'||!validStockSince(l.outOfStockSince,at))l.outOfStockSince=at;
      l.stockState='out';return false;
    }
    if(reading.status!=='ok'||available!=='in')return false;
    const back=l.stockState==='out';l.stockState='in';delete l.outOfStockSince;return back;
  }
  function stockDuration(since,now=Date.now()){
    if(!validStockSince(since,now))return '';
    const minutes=Math.floor((now-since)/60000);
    if(minutes<1)return 'less than a minute';
    const [value,unit]=minutes>=1440?[Math.floor(minutes/1440),'day']:minutes>=60?[Math.floor(minutes/60),'hour']:[minutes,'minute'];
    return value+' '+unit+(value===1?'':'s');
  }
  function historySeries(l){return [...new Set((l.history||[]).map(h=>h.currency||l.currency))].map(currency=>({currency,points:(l.history||[]).filter(h=>(h.currency||l.currency)===currency).slice().sort((a,b)=>a.at-b.at)}));}
  function variantWarning(title,game){
    const a=String(title).toLowerCase(),b=(game.name+' '+game.platform).toLowerCase();
    const platform=t=>/ps5|playstation 5/.test(t)?'PS5':/ps4|playstation 4/.test(t)?'PS4':/xbox/.test(t)?'Xbox':/switch/.test(t)?'Switch':'';
    if(platform(a)&&platform(b)&&platform(a)!==platform(b))return 'Platform differs from this product row. Check before adding.';
    if(['deluxe','ultimate','collector','day one'].some(word=>a.includes(word)!==b.includes(word)))return 'Edition may differ from this product row. Check before adding.';
    return '';
  }
  function lowest(listings,state,now=Date.now()) {
    const values=listings.filter(l=>!(state.hiddenStores||[]).includes(l.store)&&l.stockState!=='out'&&l.status==='ok'&&Number.isSafeInteger(l.cents)&&now-(l.checkedAt||0)<5*86400000)
      .map(l=>({id:l.id,value:convert(state.compareDelivered?delivered(l):l.cents,l.currency,state,now)})).filter(l=>l.value!=null);
    if(!values.length)return [];
    const min=Math.min(...values.map(l=>l.value));return values.filter(l=>l.value===min).map(l=>l.id);
  }
  function isLowestEntry(state,entry,now=Date.now()) {
    if(!entry)return false;
    const cents=entry.cents??entry.price;
    if(!Number.isSafeInteger(cents)||!entry.currency)return false;
    for(const g of state.games||[]){
      const l=g.listings.find(l=>entry.listingId?l.id===entry.listingId:entry.url&&l.url===entry.url);
      if(!l)continue;
      return !g.paused && l.cents===cents && l.currency===entry.currency && (!entry.url||entry.url===l.url) && lowest(g.listings,state,now).includes(l.id);
    }
    return false;
  }
  const validColor=value=>typeof value==='string' && /^#[0-9a-f]{6}$/i.test(value);
  function storeColor(state,id) {
    return validColor(state.storeColors?.[id])?state.storeColors[id]:({amazonIE:'#e5b064',amazonUK:'#b6a2f5',very:'#e98bbf',smyths:'#8db9fa',cex:'#ef8a7d'}[id]||'#a9efb9');
  }
  const visibleStores=state=>stores.filter(s=>!(state.hiddenStores||[]).includes(s.id)).sort((a,b)=>{const order=state.storeOrder||stores.map(s=>s.id);const rank=id=>order.includes(id)?order.indexOf(id):order.length;return rank(a.id)-rank(b.id);});
  function listingLabel(listing,index=0) {
    if(listing.details)return listing.details;
    const u=new URL(listing.url),code=listing.store.startsWith('amazon')?u.pathname.split('/').pop():listing.store==='cex'?u.searchParams.get('id'):null;
    return 'Listing '+(index+1)+(code?' · '+code:'');
  }
  function matchTitle(value) {
    return String(value||'').toLowerCase().replace(/\((?:3|7|12|15|16|18)\+?\)/g,' ')
      .replace(/\b(?:pegi|rated)\s*(?:3|7|12|15|16|18)\+?\b/g,' ')
      .replace(/\s+[([]?(?:19|20)\d{2}[)\]]?\s*$/,' ')
      .replace(/\bversus\b/g,'vs').replace(/[^a-z0-9]+/g,' ').trim();
  }
  function gameSuggestions(title,games,store) {
    const norm=matchTitle;
    const platform=s=>/playstation|ps5|ps4/.test(s)?'ps':/xbox/.test(s)?'xbox':/switch/.test(s)?'switch':'';
    const tokens=s=>new Set(norm(s).split(' ').filter(w=>w && !['xbox','series','x','s','playstation','ps5','ps4','nintendo','switch','game','games','standard','edition','for','the','and','buy','amazon','uk','ie','sega'].includes(w)));
    const t=norm(title),a=tokens(t),rank=[];
    for(const g of games){
      const n=norm(g.name+' '+g.platform),b=tokens(g.name);
      if(platform(t)&&platform(n)&&platform(t)!==platform(n))continue;
      if(['deluxe','ultimate','collector'].some(w=>t.includes(w)!==n.includes(w)))continue;
      const nums=s=>(s.match(/\b\d+\b/g)||[]).join(',');
      if(nums(norm(g.name))!==nums(t))continue;
      const common=[...b].filter(w=>a.has(w)).length,score=2*common/(a.size+b.size||1);
      if(common && common/b.size>=0.8 && score>=0.65)rank.push({id:g.id,score});
    }
    rank.sort((a,b)=>b.score-a.score);
    return rank;
  }
  function suggestGame(title,games,store) {
    const rank=gameSuggestions(title,games,store);
    return rank.length && (!rank[1] || rank[0].score-rank[1].score>=0.12)?rank[0].id:'';
  }
  function identify(raw) {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || u.username || u.password) throw Error('Use a HTTPS product URL.');
    const s = [...stores].sort((a,b)=>(b.pathPrefix||'').length-(a.pathPrefix||'').length).find(s => (u.hostname === s.host || (!s.custom && s.id !== 'cex' && u.hostname === 'www.' + s.host)) && (!s.pathPrefix || u.pathname===s.pathPrefix || u.pathname.startsWith(s.pathPrefix+'/')));
    if (!s) throw Error('Open a supported listing, or add this website using Add store in the price grid.');
    if (s.id === 'smyths' && !s.pathPrefix && !u.pathname.startsWith('/ie/')) throw Error('Add a custom regional Smyths column with its region path (for example /uk).');
    return s;
  }
  function shoptoProduct(raw){
    try{
      const u=new URL(raw),m=u.pathname.match(/^\/([a-z]{2})\/[^/]+-p(\d+)(?:\/(?:eur|gbp|usd)(?:\/[a-z]{2})?)?\/?$/i);
      if(u.protocol!=='https:'||!['shopto.net','www.shopto.net'].includes(u.hostname)||u.username||u.password||!m)return null;
      const query=[];u.searchParams.forEach((value,key)=>{if(!/^(utm_|ref|tag$|fbclid$|gclid$)/i.test(key))query.push([key,value]);});
      return {origin:u.origin,language:m[1].toLowerCase(),id:m[2],query:JSON.stringify(query.sort())};
    }catch{return null;}
  }
  function sameListingURL(a,b){
    if(a===b)return true;
    const x=shoptoProduct(a),y=shoptoProduct(b);
    return !!(x&&y&&x.origin===y.origin&&x.language===y.language&&x.id===y.id&&x.query===y.query);
  }
  function canonical(raw) {
    const s = identify(raw), u = new URL(raw); if(s.custom)return u.href; u.hash = '';
    u.hostname=s.id==='cex'?s.host:'www.'+s.host;
    u.pathname=u.pathname.replace(/\/+$/,'')||'/';
    if (s.id.startsWith('amazon')) {
      const m = u.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/i);
      if (!m) throw Error('Open an Amazon product page, not search results.');
      return `${u.origin}/dp/${m[1].toUpperCase()}`;
    }
    if (s.id === 'cex') {
      if (!/\/(?:product-detail|product)(?:\/|$)/i.test(u.pathname)) throw Error('Open a CeX product detail page.');
      const id = u.searchParams.get('id'); u.search = ''; if (id) u.searchParams.set('id', id);
    } else {
      if (u.pathname === '/' || /\/(search|search-results)(\/|$)/i.test(u.pathname)) throw Error('Open a product listing first.');
      // Avoid iterator interoperability problems in Firefox content-script realms.
      const remove=[];
      u.searchParams.forEach((value,key)=>{if (/^(utm_|ref|tag$|fbclid$|gclid$)/i.test(key)) remove.push(key);});
      remove.forEach(key=>u.searchParams.delete(key));
    }
    return u.href;
  }
  function amount(value, currency='') {
    if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? Math.round(value*100) : null;
    let s = String(value ?? '').trim().replace(/\s/g, '').replace(new RegExp('(?:'+currencies.join('|')+'|[€£$¥₺₹₩₽]|kr)', 'g'), '').replace(/[’']/g,'');
    if (!/^\d[\d.,]*$/.test(s)) return null;
    if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g,'').replace(',','.') : s.replace(/,/g,'');
    else if (s.includes(',')) s = /,\d{1,2}$/.test(s) ? s.replace(',','.') : s.replace(/,/g,'');
    else if (/^\d{1,3}(?:\.\d{3})+$/.test(s)) s=s.replace(/\./g,'');
    const n = Number(s); return Number.isFinite(n) && n >= 0 ? Math.round(n*100) : null;
  }
  const money = (cents, currency) => cents == null ? '—' : new Intl.NumberFormat('en-IE', {style:'currency', currency}).format(cents/100);
  const validTime=value=>typeof value==='string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  function nextDue(now = Date.now(), time='22:00') {
    if(!validTime(time))throw Error('Choose a valid daily scan time.');
    const [hours,minutes]=time.split(':').map(Number);
    const d = new Date(now); d.setHours(hours,minutes,0,0);
    if (d.getTime()<=now) d.setDate(d.getDate()+1);
    return d.getTime();
  }
  function targetValue(listing,target,state,now=Date.now()){
    if(!target||listing.status!=='ok'||!Number.isSafeInteger(listing.cents))return null;
    if(listing.currency===target.currency)return listing.cents;
    const value=convert(listing.cents,listing.currency,state,now),unit=convert(1000000,target.currency,state,now);
    return value==null||unit==null||unit<=0?null:Math.round(value*1000000/unit);
  }
  function targetCrossing(game,listing,state){
    const target=game.targetPrice;if(!target)return false;
    const value=targetValue(listing,target,state);if(value==null)return false;
    if(value>target.cents){listing.targetReached=false;return false;}
    if(!state.notifications||listing.targetReached)return false;
    listing.targetReached=true;return true;
  }
  function validTheme(value){
    const background=validColor(value?.background)?value.background:'#101613';
    const [r,g,b]=[1,3,5].map(i=>parseInt(background.slice(i,i+2),16));
    return {outOfStock:validColor(value?.outOfStock)?value.outOfStock:'#55353d',accent:validColor(value?.accent)?value.accent:'#a9efb9',background,tile:validColor(value?.tile)?value.tile:(r*.299+g*.587+b*.114>155?'#f5f6f7':'#18201b')};
  }
  function validBackupSettings(value){const folder=String(value?.folder||'Game-Shelf-Backups').trim();if(!/^[a-zA-Z0-9 _-]{1,60}$/.test(folder))throw Error('Use a folder name with letters, numbers, spaces, hyphens or underscores.');return {enabled:value?.enabled===true,frequency:value?.frequency==='weekly'?'weekly':'daily',folder};}
  const categories=['Games','Books','Clothes','Movies & TV','Toys','Electronics','Other'];
  const currencyCountries={EUR:'EU',GBP:'GB',USD:'US',CAD:'CA',AUD:'AU',NZD:'NZ',JPY:'JP',ISK:'IS',TRY:'TR',CHF:'CH',NOK:'NO',SEK:'SE',DKK:'DK',PLN:'PL',CZK:'CZ',HUF:'HU',RON:'RO',BGN:'BG',BRL:'BR',MXN:'MX',ZAR:'ZA',INR:'IN',CNY:'CN',HKD:'HK',SGD:'SG',KRW:'KR',TWD:'TW',AED:'AE',SAR:'SA',ILS:'IL',THB:'TH',MYR:'MY',IDR:'ID',PHP:'PH',VND:'VN',CLP:'CL',COP:'CO',ARS:'AR'};
  function currencyLabel(c){let name=c;try{name=new Intl.DisplayNames(['en'],{type:'currency'}).of(c);}catch{}const country=currencyCountries[c]||'';const flag=[...country].map(x=>String.fromCodePoint(127397+x.charCodeAt(0))).join('');return c+' — '+name+' '+flag;}
  const validSort=value=>['az','za','recent'].includes(value);
  function sortedProducts(games,order='az'){
    return games.map((g,index)=>({g,index})).sort((a,b)=>order==='recent'?(Number(b.g.createdAt)||b.index)-(Number(a.g.createdAt)||a.index):order==='za'?b.g.name.localeCompare(a.g.name):a.g.name.localeCompare(b.g.name)).map(x=>x.g);
  }
  function validDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return false;const [y,m,d]=value.split('-').map(Number),date=new Date(y,m-1,d);return date.getFullYear()===y&&date.getMonth()===m-1&&date.getDate()===d;}
  function validateSchedule(value,allowInterval=false){
    if(allowInterval&&value?.mode==='interval'){
      if(!Number.isInteger(value.hours)||value.hours<1||value.hours>23)throw Error('Choose a stock check interval from 1 to 23 hours.');
      return {mode:'interval',hours:value.hours};
    }
    if(!value || !['manual','daily','twiceDaily','weekly','twiceWeekly','custom'].includes(value.mode))throw Error('Choose a scan frequency.');
    const times=[...new Set(value.times||[])].sort(),days=[...new Set(value.days||[])].sort();
    const startDate=value.startDate||'';
    if(startDate&&!validDate(startDate))throw Error('Choose a valid starting date.');
    if(value.mode==='manual')return {mode:'manual',times:[],days:[],startDate};
    if(!times.length||times.length>2||times.some(t=>!validTime(t)))throw Error('Choose one or two valid scan times.');
    if(value.mode==='twiceDaily'&&times.length!==2)throw Error('Choose two different scan times.');
    if(['daily','weekly','twiceWeekly'].includes(value.mode)&&times.length!==1)throw Error('Choose one scan time for this frequency.');
    if(days.some(d=>!Number.isInteger(d)||d<0||d>6))throw Error('Choose valid weekdays.');
    if(value.mode==='weekly'&&days.length!==1)throw Error('Choose one weekday.');
    if(value.mode==='twiceWeekly'&&days.length!==2)throw Error('Choose two weekdays.');
    if(value.mode==='custom'&&!days.length)throw Error('Choose at least one weekday.');
    return {mode:value.mode,times,days:['daily','twiceDaily'].includes(value.mode)?[0,1,2,3,4,5,6]:days,startDate};
  }
  function nextScheduled(now,plan,previousDue=null){
    plan=validateSchedule(plan,true);if(plan.mode==='manual')return null;
    if(plan.mode==='interval'){
      const interval=plan.hours*3600000;
      if(previousDue==null)return now+interval;
      return previousDue+Math.max(1,Math.floor((now-previousDue)/interval)+1)*interval;
    }
    let day=new Date(now);day.setHours(0,0,0,0);
    if(plan.startDate && localDay(day.getTime())<plan.startDate){const [y,m,d]=plan.startDate.split('-').map(Number);day=new Date(y,m-1,d);}
    for(let i=0;i<9;i++,day.setDate(day.getDate()+1)){
      if(!plan.days.includes(day.getDay()))continue;
      for(const time of plan.times){const [h,m]=time.split(':').map(Number),candidate=new Date(day);candidate.setHours(h,m,0,0);if(candidate.getTime()>now)return candidate.getTime();}
    }
    throw Error('Could not calculate the next scan.');
  }
  function scheduleLabel(plan){return plan?.mode==='interval'?(plan.hours===1?'Every hour':'Every '+plan.hours+' hours'):({manual:'Manual only',daily:'Once a day',twiceDaily:'Twice a day',weekly:'Once a week',twiceWeekly:'Twice a week',custom:'Custom days & times'})[plan?.mode]||'Once a day';}
  function origins(store){return [...new Set(['https://'+store.host+'/*',...(!store.custom&&!store.host.startsWith('www.')?['https://www.'+store.host+'/*']:[])])];}
  function parseOnlineRates(data,base,now=Date.now()){
    if(!Array.isArray(data))throw Error('Exchange-rate service returned an unexpected response.');
    const rates={};
    for(const row of data){const c=String(row.quote||'').toUpperCase(),date=String(row.date||'');
      if(String(row.base||'').toUpperCase()!==base||!validCurrency(c)||c===base||!Number.isFinite(row.rate)||row.rate<=0||!validDate(date))continue;
      const at=Date.parse(date+'T00:00:00Z');if(at>now+86400000||now-at>7*86400000)continue;
      if(!rates[c]||at>rates[c].at)rates[c]={value:1/row.rate,at,source:'Frankfurter',date};
    }
    if(!Object.keys(rates).length)throw Error('No recent exchange rates were returned.');return rates;
  }
  function fresh() { return {learnPrices:true,sitePriceRules:[],version:1, scheduleVersion:4, scanTime:'22:00', scanPlan:{mode:'daily',times:['22:00'],days:[0,1,2,3,4,5,6],startDate:''}, productSort:'az', fxMode:'auto', manualRates:{}, fxUpdatedAt:null, fxError:'', notificationThreshold:100, baseCurrency:'EUR', storeOrder:[], exchangeRates:{}, storeOverrides:{}, customStores:[], hiddenStores:defaults.map(s=>s.id), storeColors:{}, games:[], events:[], nextDue:nextDue(), notifications:true, notifyIncreases:true, notificationMode:'individual', stockAlerts:false,outOfStockAlerts:false, notifyScanFailures:true, foregroundScans:false, retryFailed:false, compareDelivered:false, theme:{accent:'#a9efb9',background:'#101613'}, backup:{enabled:false,frequency:'daily',folder:'Game-Shelf-Backups'}, lastRun:null}; }
  function savedStockPlan(value){
    try{return validateSchedule(value,true);}catch{return validateSchedule({mode:'manual'});}
  }
  function savedStockCheck(value,now=Date.now()){
    if(!['in','out','unknown','blocked','error'].includes(value?.status)||!validStockSince(value.at,now))return undefined;
    return {status:value.status,at:value.at,message:String(value.message||'').slice(0,300)};
  }
  function migrate(state, now=Date.now()) {
    if(!validTime(state.scanTime))state.scanTime='22:00';
    if(!Number.isSafeInteger(state.notificationThreshold)||state.notificationThreshold<0)state.notificationThreshold=100;
    if(state.scheduleVersion!==4 || !state.scanPlan){state.scanPlan={mode:'daily',times:[state.scanTime],days:[0,1,2,3,4,5,6],startDate:''};state.nextDue=nextScheduled(now,state.scanPlan);state.scheduleVersion=4;}
    state.scanPlan=validateSchedule(state.scanPlan);state.learnPrices=state.learnPrices!==false;state.sitePriceRules=validPriceRules(state.sitePriceRules);
    state.stockPlan=savedStockPlan(state.stockPlan);state.stockWatchAlerts=state.stockWatchAlerts!==false;
    state.nextStockDue=state.stockPlan.mode==='manual'?null:validStockSince(state.nextStockDue,Number.MAX_SAFE_INTEGER)?state.nextStockDue:nextScheduled(now,state.stockPlan);
    state.fxMode=['auto','manual'].includes(state.fxMode)?state.fxMode:'auto';
    state.manualRates ||= Object.fromEntries(Object.entries(state.exchangeRates||{}).filter(([c,r])=>validCurrency(c)&&Number.isFinite(r.value)&&r.value>0&&r.source!=='Frankfurter').map(([c,r])=>[c,{...r,source:'override'}]));state.productSort=validSort(state.productSort)?state.productSort:'az';
    state.notifyIncreases=state.notifyIncreases!==false;state.theme=validTheme(state.theme);state.backup=validBackupSettings(state.backup);
    state.notificationMode=state.notificationMode==='summary'?'summary':'individual';state.stockAlerts=!!state.stockAlerts;state.outOfStockAlerts=!!state.outOfStockAlerts;state.notifyScanFailures=state.notifyScanFailures!==false;state.foregroundScans=!!state.foregroundScans;state.retryFailed=!!state.retryFailed;state.compareDelivered=!!state.compareDelivered;
    state.games.forEach(g=>{g.paused=!!g.paused;g.category=categories.includes(g.category)?g.category:'Games';(g.listings||[]).forEach(l=>{if(l.stockState!=='out'||!validStockSince(l.outOfStockSince,now))delete l.outOfStockSince;if(l.stockWatch!==true)delete l.stockWatch;l.stockCheck=savedStockCheck(l.stockCheck,now);});});
    state.customStores ||= []; state.storeOverrides ||= {}; state.baseCurrency=validCurrency(state.baseCurrency)?state.baseCurrency:'EUR'; state.exchangeRates ||= {}; configureStores(state.customStores,state.storeOverrides);
    state.hiddenStores=Array.isArray(state.hiddenStores)?state.hiddenStores.filter(id=>stores.some(s=>s.id===id)):[];
    state.storeColors=Object.fromEntries(Object.entries(state.storeColors||{}).filter(([id,color])=>stores.some(s=>s.id===id)&&validColor(color)));
    state.lastCheck=validLastCheck(state.lastCheck,now);
    if(state.lastSummary?.inProgress){state.lastSummary={...state.lastSummary,inProgress:false,partial:true,interrupted:true};}
    return state;
  }
  function lowestEUR(listings, now=Date.now()) {
    const eligible=listings.filter(l=>l.currency==='EUR'&&l.stockState!=='out'&&l.status==='ok'&&Number.isSafeInteger(l.cents)&&l.cents>=0&&now-(l.checkedAt||0)<5*86400000);
    if(!eligible.length)return [];
    const min=Math.min(...eligible.map(l=>l.cents));
    return eligible.filter(l=>l.cents===min).map(l=>l.id);
  }
  function record(listing, reading, at=Date.now()) {
    listing.lastAttempt=at;listing.errorReason=reading.errorReason==='not-found'?'not-found':reading.errorReason==='timeout'?'timeout':'';
    if(reading.status==='ok'&&/^(?:OutOfStock|SoldOut|Discontinued)$/i.test(String(reading.availability||'').split('/').pop()))reading={...reading,status:'unavailable',unavailableReason:'out-of-stock'};
    const allowed=listing.store==='amazonUK'?['EUR','GBP',listing.currency]:[listing.currency];
    if (reading.status !== 'ok' || !Number.isSafeInteger(reading.cents) || reading.cents<0 || !allowed.includes(reading.currency)) {
      listing.status=reading.status === 'ok' ? 'error' : reading.status;
      if(listing.status==='unavailable'){listing.unavailableReason=reading.unavailableReason==='no-featured-offer'?'no-featured-offer':'out-of-stock';listing.availability=reading.availability||'OutOfStock';}
      listing.error=reading.error || 'Price unavailable; last known price retained.'; return null;
    }
    const currencyChanged=listing.currency!==reading.currency;
    listing.history ||= [];
    listing.history.forEach(h=>{if(!h.currency)h.currency=listing.currency;});
    const old=currencyChanged?null:listing.cents;
    if(currencyChanged){delete listing.previous;delete listing.changedAt;}
    listing.currency=reading.currency;
    delete listing.unavailableReason;listing.cents=reading.cents; listing.status='ok'; listing.error=''; listing.checkedAt=at;
    listing.source=reading.source; listing.availability=reading.availability || 'Unknown';
    listing.history ||= [];
    if (old == null || old !== reading.cents) listing.history.push({at,cents:reading.cents,currency:reading.currency});
    listing.history=listing.history.slice(-200);
    if (old != null && old !== reading.cents) { listing.previous=old; listing.changedAt=at; return {old,price:reading.cents}; }
    return null;
  }
  function localDay(at=Date.now()) {
    const d=new Date(at);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function sortedEvents(events, order='newest', day='') {
    const list=events.filter(e=>!day || localDay(e.at)===day);
    const stock=list.filter(e=>['out-of-stock','back-in-stock'].includes(e.type)).sort((a,b)=>b.at-a.at);
    if(order==='drop')return list.filter(e=>e.old>e.price).sort((a,b)=>a.currency.localeCompare(b.currency) || ((b.old-b.price)-(a.old-a.price)) || b.at-a.at).concat(stock);
    if(order==='percent')return list.filter(e=>e.old>e.price && e.old>0).sort((a,b)=>((b.old-b.price)/b.old-(a.old-a.price)/a.old) || b.at-a.at).concat(stock);
    return list.sort((a,b)=>b.at-a.at);
  }
  function validateBackup(data) {
    const previous=stores.map(s=>({...s}));
    try { configureStores(data?.customStores||[],data?.storeOverrides||{}); return parseBackup(data); } finally { stores.splice(0,stores.length,...previous); }
  }
  function parseBackup(data) {
    if (!data || data.version!==1 || !Array.isArray(data.games) || data.games.length>1000) throw Error('Not a Game Shelf v1 backup.');
    const out=fresh(), ids=new Set();
    out.customStores=stores.slice(5);
    out.storeOrder=Array.isArray(data.storeOrder)?[...new Set(data.storeOrder.filter(id=>stores.some(s=>s.id===id)))]:[];
    out.storeOverrides=Object.fromEntries(stores.slice(0,5).map(s=>[s.id,{name:String(s.name).slice(0,60),region:String(s.region||'').slice(0,60),currency:s.currency,pathPrefix:s.pathPrefix||''}]));
    out.baseCurrency=validCurrency(data.baseCurrency)?data.baseCurrency:'EUR';
    out.exchangeRates=Object.fromEntries(Object.entries(data.exchangeRates||{}).filter(([c,r])=>validCurrency(c)&&r&&Number.isFinite(r.value)&&r.value>0&&Number.isFinite(r.at)).map(([c,r])=>[c,{value:r.value,at:r.at,source:r.source==='Frankfurter'?'Frankfurter':'manual',date:validDate(r.date)?r.date:undefined}]));
    out.hiddenStores=Array.isArray(data.hiddenStores)?data.hiddenStores.filter(id=>stores.slice(0,5).some(s=>s.id===id)):[];
    out.storeColors=Object.fromEntries(Object.entries(data.storeColors||{}).filter(([id,color])=>stores.some(s=>s.id===id)&&validColor(color)));
    out.notificationMode=data.notificationMode==='summary'?'summary':'individual';out.stockAlerts=!!data.stockAlerts;out.outOfStockAlerts=!!data.outOfStockAlerts;out.notifyScanFailures=data.notifyScanFailures!==false;out.foregroundScans=!!data.foregroundScans;out.retryFailed=!!data.retryFailed;out.compareDelivered=!!data.compareDelivered;
    out.learnPrices=data.learnPrices!==false;out.sitePriceRules=validPriceRules(data.sitePriceRules);
    out.notifications=data.notifications!==false;out.notifyIncreases=data.notifyIncreases!==false;out.theme=validTheme(data.theme);out.backup=validBackupSettings(data.backup);out.backup.enabled=false;
    if(validTime(data.scanTime))out.scanTime=data.scanTime;
    if(Number.isSafeInteger(data.notificationThreshold)&&data.notificationThreshold>=0)out.notificationThreshold=data.notificationThreshold;
    out.scanPlan=data.scanPlan?validateSchedule(data.scanPlan):{mode:'daily',times:[out.scanTime],days:[0,1,2,3,4,5,6],startDate:''};
    out.nextDue=nextScheduled(Date.now(),out.scanPlan);out.productSort=validSort(data.productSort)?data.productSort:'az';
    out.stockPlan=savedStockPlan(data.stockPlan);out.nextStockDue=nextScheduled(Date.now(),out.stockPlan);out.stockWatchAlerts=data.stockWatchAlerts!==false;
    out.fxMode=['auto','manual'].includes(data.fxMode)?data.fxMode:'auto';
    out.manualRates=Object.fromEntries(Object.entries(data.manualRates||Object.fromEntries(Object.entries(out.exchangeRates).filter(([c,r])=>r.source!=='Frankfurter'))).filter(([c,r])=>validCurrency(c)&&r&&Number.isFinite(r.value)&&r.value>0).map(([c,r])=>[c,{value:r.value,at:Number(r.at)||Date.now(),source:'override'}]));
    out.fxUpdatedAt=Number(data.fxUpdatedAt)||null;out.lastCheck=validLastCheck(data.lastCheck);
    for (const g of data.games) {
      if (!g || typeof g.name!=='string' || !g.name.trim() || !Array.isArray(g.listings)) throw Error('Invalid game in backup.');
      const game={paused:!!g.paused,category:categories.includes(g.category)?g.category:'Games',createdAt:Number(g.createdAt)||0,id:crypto.randomUUID(),name:g.name.slice(0,200),platform:String(g.platform||'').slice(0,80),listings:[]};
      if(g.targetPrice&&Number.isSafeInteger(g.targetPrice.cents)&&g.targetPrice.cents>=0&&validCurrency(g.targetPrice.currency))game.targetPrice={cents:g.targetPrice.cents,currency:g.targetPrice.currency};
      for (const l of g.listings) {
        const url=canonical(l.url), s=identify(url);
        if(ids.has(url)) throw Error('Duplicate listing in backup.');
        if(out.hiddenStores.includes(s.id))throw Error('Backup has listings for a deleted store.');
        ids.add(url);
        const cents=Number.isSafeInteger(l.cents)&&l.cents>=0?l.cents:null;
        const currency=validCurrency(l.currency)?l.currency:s.currency;
        game.listings.push({stockWatch:l.stockWatch===true||undefined,stockCheck:savedStockCheck(l.stockCheck),stockState:['in','out'].includes(l.stockState)?l.stockState:undefined,outOfStockSince:l.stockState==='out'&&validStockSince(l.outOfStockSince)?l.outOfStockSince:undefined,details:String(l.details||'').slice(0,160),shippingCents:validCost(l.shippingCents)?l.shippingCents:null,shippingCurrency:validCurrency(l.shippingCurrency)?l.shippingCurrency:currency,id:crypto.randomUUID(),url,store:s.id,currency,cents,selector:String(l.selector||'').slice(0,1000),status:'pending',error:'Imported — awaiting check',checkedAt:Number(l.checkedAt)||null,history:Array.isArray(l.history)?l.history.filter(h=>Number.isSafeInteger(h.cents)&&h.cents>=0&&Number.isFinite(h.at)).slice(-200).map(h=>({at:h.at,cents:h.cents,currency:validCurrency(h.currency)?h.currency:currency})):[]});
      }
      out.games.push(game);
    }
    out.events=(Array.isArray(data.events)?data.events:[]).filter(e=>{
      try{return e&&new URL(e.url).protocol==='https:'&&validCurrency(e.currency)&&(['out-of-stock','back-in-stock'].includes(e.type)||(!e.type&&Number.isSafeInteger(e.old)&&e.old>=0&&Number.isSafeInteger(e.price)&&e.price>=0))&&Number.isFinite(e.at);}catch{return false;}
    }).slice(0,500).map(e=>({id:crypto.randomUUID(),at:e.at,url:e.url,currency:e.currency,...(['out-of-stock','back-in-stock'].includes(e.type)?{type:e.type}:{old:e.old,price:e.price}),game:String(e.game||'').slice(0,200),platform:String(e.platform||'').slice(0,80),store:String(e.store||'').slice(0,200),storeName:String(e.storeName||'').slice(0,60)}));
    const summary=data.lastSummary;
    if(summary&&Number.isSafeInteger(summary.at)&&summary.at>0&&summary.at<=Date.now()&&Array.isArray(summary.items)){
      out.lastSummary={at:summary.at,partial:!!summary.partial,items:summary.items.slice(0,500).filter(item=>item&&typeof item.title==='string'&&typeof item.message==='string').map(item=>{
        const saved={title:item.title.slice(0,1000),message:item.message.slice(0,4000)};
        try{
          const u=new URL(item.url);
          if(u.protocol==='https:'&&!u.username&&!u.password&&validCost(item.cents)&&validCurrency(item.currency)){
            saved.url=u.href;saved.cents=item.cents;saved.currency=item.currency;
            const l=out.games.flatMap(g=>g.listings).find(l=>l.url===saved.url);
            if(l)saved.listingId=l.id;
          }
        }catch{}
        return saved;
      })};
    }
    return out;
  }
  return {scanPolicy,validLastCheck,runLength,shoptoProduct,sameListingURL,validPriceRules,availabilityState,stockDuration,isLowestEntry,validCost,delivered,scanListings,stockChange,historySeries,variantWarning,targetValue,targetCrossing,validTheme,validBackupSettings,categories,currencyLabel,validSort,sortedProducts,validDate,validateSchedule,nextScheduled,scheduleLabel,origins,parseOnlineRates,currencies,validCurrency,convert,lowest,stores,validColor,storeColor,visibleStores,listingLabel,customStore,configureStores,gameSuggestions,suggestGame,identify,canonical,amount,money,validTime,localDay,nextDue,fresh,migrate,lowestEUR,record,sortedEvents,validateBackup};
})();
