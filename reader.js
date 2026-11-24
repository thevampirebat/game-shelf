/*
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at https://mozilla.org/MPL/2.0/.
*/
/* Runs only when requested, in the listing's rendered page. No remote code. */
globalThis.GameShelfReader = (() => {
  const text = e => (e?.getAttribute('content') || e?.textContent || '').trim();
  const visible = e => e && !e.closest('[hidden],del,s') && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden' && (e.tagName==='META' || e.getClientRects().length>0);
  // A currency code may directly touch a digit: EUR42.91 has no word boundary after EUR.
  const hasEUR = raw => /€|(?:^|[^a-z])EUR(?=$|[^a-z])/i.test(raw);
  const hasGBP = raw => /£|(?:^|[^a-z])GBP(?=$|[^a-z])/i.test(raw);
  const symbols={EUR:['€'],GBP:['£'],USD:['US$','$'],CAD:['CA$','C$','$'],AUD:['AU$','A$','$'],NZD:['NZ$','$'],JPY:['JP¥','¥','￥'],CNY:['CN¥','¥','￥'],ISK:['kr.','kr'],TRY:['₺','TL'],CHF:['Fr.','Fr'],NOK:['kr'],SEK:['kr'],DKK:['kr'],PLN:['zł'],CZK:['Kč'],HUF:['Ft'],INR:['₹'],KRW:['₩'],BRL:['R$'],MXN:['MX$','$'],ZAR:['R'],HKD:['HK$','$'],SGD:['S$','$'],TWD:['NT$','$'],THB:['฿']};
  function priceText(raw, currency) {
    let s=String(raw).replace(/\s+/g,' ').trim();
    const codes=s.match(/[A-Z]{3}(?![a-z])/g)||[];
    if(codes.some(c=>Shelf.validCurrency(c)&&c!==currency))return null;
    if((s.includes('€')&&currency!=='EUR')||(s.includes('£')&&currency!=='GBP'))return null;
    const tokens=[currency,...(symbols[currency]||[])].sort((a,b)=>b.length-a.length);
    let marked=false;
    for(const token of tokens)if(s.includes(token)){marked=true;s=s.split(token).join(' ');}
    // A deliberately picked element may contain a plain amount; its configured currency applies.
    if(!marked && !/^\d[\d.,'’\s]*$/.test(s))return null;
    if(!/^\s*\d[\d.,'’\s]*$/.test(s))return null;
    if(/\d\s+\d/.test(s) && !/^\s*\d{1,3}(?:[ \u00a0]\d{3})+(?:[.,]\d{1,2})?\s*$/.test(s))return null;
    return Shelf.amount(s,currency);
  }
  // ShopTo renders the selling amount as an image. Use only a matching
  // Product Offer, never OG metadata, member prices or installment amounts.
  function shoptoOffer(pageURL, currency) {
    if(!/^https:\/\/(?:www\.)?shopto\.net(?:\/|$)/i.test(pageURL))return null;
    const offers=[];
    function collect(n){
      if(!n||typeof n!=='object')return;
      if(Array.isArray(n)){n.forEach(collect);return;}
      if([].concat(n['@type']||[]).includes('Product')){
        for(const o of [].concat(n.offers||[])){
          if(!o || [].concat(o['@type']||[]).includes('AggregateOffer') || o.priceCurrency!==currency)continue;
          try{if(Shelf.canonical(new URL(o.url,pageURL).href)!==Shelf.canonical(pageURL))continue;}catch{continue;}
          const cents=Shelf.amount(o.price,currency);
          if(cents!=null)offers.push({cents,availability:String(o.availability||'Unknown').split('/').pop()});
        }
      }
      if(n['@graph'])collect(n['@graph']);if(n.mainEntity)collect(n.mainEntity);
    }
    for(const script of document.querySelectorAll('script[type="application/ld+json"]')){try{collect(JSON.parse(script.textContent));}catch{}}
    const values=[...new Set(offers.map(o=>o.cents))];
    return values.length===1?offers[0]:null;
  }
  function shoptoImageBox(node, pageURL) {
    if(!/^https:\/\/(?:www\.)?shopto\.net(?:\/|$)/i.test(pageURL))return null;
    const box=node?.closest?.('.itemcard_order_button_cust_price_wrapper.base_price');
    const productId=pageURL.match(/-p(\d+)(?:\/|$)/)?.[1];
    const form=box?.closest?.('form');
    return box && productId && form?.querySelector?.('[name="item_id"]')?.value===productId?box:null;
  }
  function priceElement(node) {
    // Amazon duplicates the accessible amount and splits the visible amount into spans.
    if(typeof location!=='undefined' && /^https:\/\/(?:www\.)?shopto\.net(?:\/|$)/i.test(location.href)){
      const box=shoptoImageBox(node,location.href);
      if(box)return box;
    }
    const sale=node?.closest?.('sale-price');
    if(sale)return sale;
    const container=node?.closest?.('.a-price');
    if(container && !container.closest('.a-text-price,del,s')) return container;
    // Very's current-price heading includes screen-reader wording.
    // Resolve the price box only when it contains exactly one current amount.
    const basic=node?.closest?.('[data-testid="product-price__basic"]');
    if(basic)return basic;
    if(node?.matches?.('[data-testid="product-price"]')){
      const amounts=Array.from(node.querySelectorAll('[data-testid="product-price__basic"]'));
      if(amounts.length===1)return amounts[0];
    }
    return node;
  }
  function elementPrice(node) {
    const e=priceElement(node);
    if(e?.matches?.('.a-price')) {
      const accessible=Array.from(e.querySelectorAll('.a-offscreen'));
      const values=Array.from(new Set(accessible.map(text).filter(Boolean)));
      if(values.length===1) return values[0];
      if(values.length>1) return '';
      const symbol=text(e.querySelector('.a-price-symbol'));
      const whole=text(e.querySelector('.a-price-whole')).replace(/[.,\s]+$/,'');
      const fraction=text(e.querySelector('.a-price-fraction'));
      if(symbol && /^\d[\d,.]*$/.test(whole) && /^\d{2}$/.test(fraction)) return symbol+whole+'.'+fraction;
    }
    if(e?.matches?.('[data-testid="product-price__basic"]'))return text(e).replace(/^Current (?:sale )?price is\s*/i,'').trim();
    if(e?.matches?.('sale-price'))return text(e).replace(/^Sale price\s*/i,'').trim();
    return text(e);
  }
  function pickTarget(node, currencyOverride=null) {
    const price=priceElement(node);
    if(price!==node || price?.matches?.('.a-price'))return price;
    let current=node;
    for(let depth=0;current && depth<4;depth++,current=current.parentElement){
      if(current.closest?.('del,s,.a-text-price'))return node;
      const raw=elementPrice(current);
      if(raw.length>100)break;
      if(priceText(raw,currencyOverride||Shelf.identify(location.href).currency)!=null)return current;
    }
    return node;
  }
  function amazonStock(){
    const nodes=['#availability','#availabilityInsideBuyBox_feature_div','#outOfStock','#unavailability_feature_div'].flatMap(sel=>Array.from(document.querySelectorAll(sel))).filter(visible);
    return nodes.some(e=>/currently unavailable|temporarily out of stock|\bout of stock\b|we (?:do not|don't) know when (?:or if )?this item will be back/i.test(text(e)));
  }
  function amazonNoOffer(){
    const nodes=['#buybox-see-all-buying-choices','#buybox-see-all-buying-choices-announce','#buybox-see-all-buying-choices-link','#buybox .a-button-text','#desktop_buybox .a-button-text','#rightCol .a-button-text'].flatMap(sel=>Array.from(document.querySelectorAll(sel))).filter(visible);
    return nodes.some(e=>/^see all buying options$/i.test(text(e)));
  }
  function pageFailure(){
    const body=(document.body?.innerText||'').slice(0,12000);
    if(document.querySelector('#captchacharacters,form[action*="validateCaptcha"],#challenge-running') || /robot check|just a moment|access denied|checking your browser|security check|pardon our interruption|verify.*human/i.test(document.title) || /verify (?:that )?you(?:'re| are) (?:not a robot|human)|enter the characters you see below|checking your browser|performing security verification/i.test(body)) return {status:'blocked',error:'Store verification required. Open the listing in Firefox.'};
    const missingPage=t=>/^(?:(?:error\s*)?404(?:\s*[-:|–—]\s*|\s+))?(?:(?:page|product|item)(?: you(?:'re| are) looking for)? (?:was |is )?not found|this page (?:does not|doesn't) exist|sorry[,!]? (?:we (?:couldn['’]t|cannot) find (?:that|this|the) page|that page doesn['’]t exist))\b/i.test(t)||/^(?:error\s*)?404(?:\s*[-:|–—]\s*(?:not found|error))?$/i.test(t);
    if(missingPage(document.title||'')||Array.from(document.querySelectorAll('h1,[role="heading"][aria-level="1"]')).some(e=>visible(e)&&missingPage(text(e))))return {status:'error',error:'Page not found (404); last known price retained.',errorReason:'not-found',terminal:true};
    return null;
  }
  function structuredProducts(){
    const products=[];
    function collect(node){
      if(!node||typeof node!=='object')return;
      if(Array.isArray(node)){node.forEach(collect);return;}
      if([].concat(node['@type']||[]).includes('Product'))products.push(node);
      if(node['@graph'])collect(node['@graph']);
      if(node.mainEntity)collect(node.mainEntity);
    }
    for(const script of document.querySelectorAll('script[type="application/ld+json"]')){
      try{collect(JSON.parse(script.textContent));}catch{}
    }
    return products;
  }
  const individualOffers=product=>[].concat(product.offers||[]).filter(o=>o&&! [].concat(o['@type']||[]).includes('AggregateOffer'));
  function readStock(pageURL=location.href){
    const problem=pageFailure();
    if(problem)return problem;
    let url,store;
    try{url=Shelf.canonical(pageURL);store=Shelf.identify(url);}catch(e){return {status:'error',error:e.message};}
    const result=(status,error)=>({url,status,error});
    const unknown=()=>result('unknown','The store did not show a clear stock status for this listing.');
    if(store.id.startsWith('amazon')){
      const asin=document.querySelector('#ASIN')?.value;
      if(asin&&!url.includes(asin.toUpperCase()))return unknown();
      if(amazonStock())return result('out');
      if(amazonNoOffer())return result('unknown','No featured offer. Check See All Buying Options for other sellers.');
      const availability=document.querySelector('#availability');
      if(visible(availability)&&/^(?:in stock|only\s+\d+\s+left in stock)\b/i.test(text(availability)))return result('in');
    }
    const variant=new URL(pageURL).searchParams.get('variant');
    const boox=/^https:\/\/(?:[a-z0-9-]+\.)*boox\.com\/products\//i.test(pageURL);
    if(boox&&variant){
      const selected=document.querySelector('#product-selectors');
      const ids=selected?[selected.value]:Array.from(document.querySelectorAll('form[action*="/cart/add"] [name="id"]'),node=>node.value);
      if(ids.length===0||ids.some(id=>String(id)!==variant))return unknown();
    }
    const matches=value=>{
      if(!value)return false;
      try{return Shelf.sameListingURL(Shelf.canonical(new URL(value,pageURL).href),url);}catch{return false;}
    };
    const products=structuredProducts();
    const offers=products.flatMap(product=>{
      const identity=product.url||product['@id'];
      const exact=matches(identity);
      const unnamed=products.length===1&&!identity&&!variant;
      return individualOffers(product).filter(offer=>offer.url?matches(offer.url):exact||unnamed);
    });
    // Preorders and conflicting or unspecified offers do not confirm a restock.
    const statuses=new Set(offers.map(offer=>{
      const value=String(offer.availability||'').split('/').pop();
      return /^availablefororder$/i.test(value)?'unknown':Shelf.availabilityState(value);
    }));
    if(statuses.size===1){
      const [status]=statuses;
      if(status!=='unknown')return result(status);
    }
    return unknown();
  }
  function read(selector='', pageURL=location.href, currencyOverride=null, learnedRules=[]) {
    const pageProblem=pageFailure();if(pageProblem)return pageProblem;
    let store, url;
    try {store={...Shelf.identify(pageURL)};if(Shelf.validCurrency(currencyOverride))store.currency=currencyOverride;url=Shelf.canonical(pageURL);} catch(e) {return {status:'error',error:e.message};}
    const title=text(document.querySelector('#productTitle')) || text(document.querySelector('h1')) || document.title;
    const base={url,store:store.id,currency:store.currency,title:title.slice(0,200)};
    const fail=(status,error)=>({...base,status,error});
    const body=(document.body?.innerText || '').slice(0,12000);
    if(Shelf.shoptoProduct(pageURL)){
      const actual=Array.from(document.querySelectorAll('#currency_switch li.active a')).map(e=>(e.textContent||'').trim().match(/^(EUR|GBP|USD)\b/)?.[1]).filter(Boolean);
      if(actual.some(c=>c!==store.currency))return fail('error','ShopTo is showing '+actual[0]+' instead of '+store.currency+'. Wait for automatic currency switching, then try again.');
      const metaCurrency=document.querySelector('meta[property="og:price:currency"]')?.getAttribute('content');
      if(Shelf.validCurrency(metaCurrency)&&metaCurrency!==store.currency)return fail('error','ShopTo product currency is still '+metaCurrency+'; waiting for '+store.currency+'. Previous price retained.');
    }
    const booxPage=/^https:\/\/(?:[a-z0-9-]+\.)*boox\.com\/products\//i.test(pageURL);
    if(booxPage){
      const requested=new URL(pageURL).searchParams.get('variant'),main=document.querySelector('#product-selectors');
      const ids=main?[String(main.value||'')]:Array.from(document.querySelectorAll('form[action*="/cart/add"] [name="id"]')).map(e=>String(e.value||''));
      const selected=[...new Set(ids.filter(id=>/^\d+$/.test(id)))];
      if(selected.length!==1||(requested&&selected[0]!==requested))return fail('error','Waiting for the requested Boox bundle/edition to be selected.');
      base.variantId=selected[0];
    }
    const make=(cents,source,availability='Unknown')=>({...base,status:'ok',cents,source,availability});
    const parsePrice=raw=>{
      const currency=store.id==='amazonUK'?(hasEUR(raw)?'EUR':hasGBP(raw)?'GBP':store.currency):store.currency;
      return currency?{currency,cents:priceText(raw,currency)}:{currency:null,cents:null};
    };
    const amazon=store.id.startsWith('amazon');
    if(amazon){
      const asin=document.querySelector('#ASIN')?.value;
      if(asin && !url.includes(asin.toUpperCase()))return fail('error','Amazon selected a different variant. Open the intended listing again.');
      if(amazonStock())return {...fail('unavailable','Out of stock; last known price retained.'),unavailableReason:'out-of-stock',availability:'OutOfStock'};
    }
    function readLearned(){
      for(const rule of [...learnedRules].reverse()){
        if(rule.origin!==new URL(pageURL).origin||rule.store!==store.id||rule.currency!==store.currency)continue;
        let nodes;try{nodes=Array.from(document.querySelectorAll(rule.selector)).filter(e=>visible(e)&&!e.closest('del,s,compare-at-price,.a-text-price,.product-card,.recommendations'));}catch{continue;}
        if(nodes.length!==1)continue;
        const cents=priceText(elementPrice(nodes[0]),store.currency);
        if(cents!=null)return make(cents,'Learned store price layout');
      }
      return null;
    }
    const missingPicked=message=>amazon&&amazonNoOffer()?{...fail('unavailable','No featured offer. Open See All Buying Options to check other sellers.'),unavailableReason:'no-featured-offer',availability:'Unknown'}:fail('error',message);
    if(selector) {
      let nodes;try{nodes=[...document.querySelectorAll(selector)].filter(visible);}catch{return fail('error','Saved price selector is invalid. Pick the price again.');}
      if(!nodes.length)return readLearned()||missingPicked('The picked price moved. Pick it again.');
      if(nodes.length!==1)return fail('error','The picked price is ambiguous. Pick it again.');
      if(shoptoImageBox(nodes[0],pageURL)){
        const offer=shoptoOffer(pageURL,store.currency);
        return offer?make(offer.cents,'ShopTo product data (image price)',offer.availability):fail('error','ShopTo image price has no matching product offer in this currency.');
      }
      const price=parsePrice(elementPrice(nodes[0]));
      return price.cents==null?fail('error','Picked element no longer contains one price.'):{...make(price.cents,'Manually picked price'),currency:price.currency,learnedSelector:learnSelector(priceElement(nodes[0]),price.currency)};
    }
    if(store.id.startsWith('amazon')) {
      const learned=readLearned();if(learned)return learned;
      const asin=document.querySelector('#ASIN')?.value;
      if(asin && !url.includes(asin.toUpperCase())) return fail('error','Amazon selected a different variant. Open the intended listing again.');
      const availability=text(document.querySelector('#availability'));
      // Read only known NEW purchase-box price slots; never all prices in rightCol,
      // which also contains used offers, delivery fees and financing amounts.
      const buyBoxSelectors=['#newBuyBoxPrice','#buyNewSection #price_inside_buybox','#newAccordionRow_0 .a-price:not(.a-text-price)','#buyNewSection .a-price:not(.a-text-price)'];
      for(const sel of buyBoxSelectors){
        const values=Array.from(document.querySelectorAll(sel)).filter(e=>visible(e)&&!e.closest('.a-text-price,del,s,#usedBuySection,#usedBuyBox,[id^="usedAccordionRow"]')).map(e=>parsePrice(elementPrice(e))).filter(p=>p.cents!=null);
        const unique=[...new Map(values.map(p=>[p.currency+':'+p.cents,p])).values()];
        if(unique.length===1)return {...make(unique[0].cents,'Amazon Buy New purchase box',availability||'Unknown'),currency:unique[0].currency};
        if(unique.length>1)return fail('error','More than one Buy New price. Use Pick price on page.');
      }
      // Scope to the main offer. Never read crossed-out/list prices or recommendations.
      const selectors=['#corePriceDisplay_desktop_feature_div .priceToPay .a-offscreen','#corePriceDisplay_desktop_feature_div .a-price:not(.a-text-price) .a-offscreen','#corePrice_feature_div .a-price:not(.a-text-price) .a-offscreen','#apex_desktop .priceToPay .a-offscreen','#priceblock_ourprice','#priceblock_dealprice','#corePriceDisplay_desktop_feature_div .a-price:not(.a-text-price)','#corePrice_feature_div .a-price:not(.a-text-price)','#apex_desktop .priceToPay','.apex-pricetopay-value.priceToPay'];
      for(const sel of selectors) {
        const values=[...document.querySelectorAll(sel)].filter(e=>!e.closest('.a-text-price,del,s')).map(e=>parsePrice(elementPrice(e))).filter(p=>p.cents!=null);
        const unique=[...new Map(values.map(p=>[p.currency+':'+p.cents,p])).values()];
        if(unique.length===1) return {...make(unique[0].cents,'Amazon main offer',availability || 'Unknown'),currency:unique[0].currency};
        if(unique.length>1) return fail('error','More than one main offer price. Use Pick price on page.');
      }
      return amazonNoOffer()?{...fail('unavailable','No featured offer. Open See All Buying Options to check other sellers.'),unavailableReason:'no-featured-offer',availability:'Unknown'}:fail('error','Main Amazon offer not found. Wait for the page or use Pick price on page.');
    }
    // Only Product nodes outside ItemList / recommendations. No lowPrice aggregates.
    const products=structuredProducts();
    let selected=products.filter(p=>{try{return (p.url || p['@id']) && Shelf.canonical(new URL(p.url || p['@id'],pageURL).href)===url;}catch{return false;}});
    if(!selected.length && products.length===1 && !products[0].url && !products[0]['@id']) selected=products;
    if(base.variantId&&!selector){
      const offers=products.filter(p=>{
        try{const u=new URL(p.url||p['@id']||pageURL,pageURL),current=new URL(pageURL);return u.origin===current.origin&&u.pathname===current.pathname;}catch{return false;}
      }).flatMap(p=>[].concat(p.offers||[])).filter(o=>{
        try{const u=new URL(o.url,pageURL),current=new URL(pageURL);return u.origin===current.origin&&u.pathname===current.pathname&&u.searchParams.get('variant')===base.variantId&&o.priceCurrency===store.currency;}catch{return false;}
      });
      const values=[...new Set(offers.map(o=>Shelf.amount(o.price,store.currency)).filter(n=>n!=null))];
      if(offers.length&&offers.every(o=>/^(?:OutOfStock|SoldOut|Discontinued)$/i.test(String(o.availability||'').split('/').pop())))return {...fail('unavailable','Selected Boox bundle is out of stock; last known price retained.'),unavailableReason:'out-of-stock'};
      const learned=readLearned();if(learned)return learned;
      if(values.length===1)return make(values[0],'Selected Boox bundle product data',String(offers[0].availability||'Unknown').split('/').pop());
    }
    if(selected.length===1) {
      const p=selected[0], offers=individualOffers(p);
      if(offers.length&&offers.every(o=>(!o.priceCurrency||o.priceCurrency===store.currency)&&/^(?:OutOfStock|Discontinued|SoldOut)$/i.test(String(o.availability||'').split('/').pop())))return {...fail('unavailable','Out of stock; last known price retained.'),unavailableReason:'out-of-stock',availability:'OutOfStock'};
      const learned=readLearned();if(learned)return learned;
      const valid=offers.map(o=>({o,n:Shelf.amount(o.price),c:o.priceCurrency})).filter(x=>x.n!=null&&x.c===store.currency);
      const values=[...new Set(valid.map(x=>x.n))];
      if(values.length===1) {
        const v=valid[0], available=String(v.o.availability||'Unknown').split('/').pop();
        if(/OutOfStock|Discontinued|SoldOut/i.test(available))return fail('unavailable','Out of stock; last known price retained.');
        return {...make(v.n,'Product structured data',available),title:String(p.name||title).slice(0,200)};
      }
      if(values.length>1) return fail('error','Several variants or offers have different prices. Pick the exact price.');
    }
    const learned=readLearned();if(learned)return learned;
    const selectors={
      very:['#product-detail [data-testid="product-price__basic"]','#productPrice .productPriceNow','#productPrice .nowPrice','.product-price .price-now','[data-testid="product-price"]','[itemtype*="schema.org/Product"] [itemprop="price"]'],
      smyths:['.pdp-price','.product-details .price','[data-testid="product-price"]','[itemtype*="schema.org/Product"] [itemprop="price"]'],
      cex:['[data-testid="sell-price"]','.product-details .sell-price','.product-price .sell-price']
    }[store.id] || ['.product-info__price sale-price'];
    for(const sel of selectors) {
      const nodes=[...document.querySelectorAll(sel)].filter(visible);
      if(nodes.length!==1) continue;
      const e=nodes[0]; let cents=priceText(elementPrice(e),store.currency);
      if(cents==null && e.getAttribute('itemprop')==='price') {
        const c=document.querySelector('[itemprop="priceCurrency"]');
        if(text(c)===store.currency) cents=Shelf.amount(text(e));
      }
      if(cents!=null) return make(cents,'Product price element');
    }
    // CeX explicitly distinguishes its retail selling price from trade-in cash/voucher values.
    if(store.id==='cex') {
      const matches=[...body.matchAll(/(?:we sell for|buy for)\s*:?\s*€\s*(\d[\d.,]*)/gi)];
      if(matches.length===1) return make(Shelf.amount(matches[0][1]),'CeX retail price');
    }
    return fail('error','No unambiguous product price found. Use Pick price on page.');
  }
  function learnSelector(target,currency){
    if(!target||target.closest?.('del,s,compare-at-price,.a-text-price,.product-card,.recommendations')||priceText(elementPrice(target),currency)==null)return '';
    const parts=[];let node=target,semantic=false;
    for(let depth=0;node&&depth<7;depth++,node=node.parentElement){
      const tag=String(node.tagName||'').toLowerCase();if(!tag||['html','body'].includes(tag))break;
      const classes=Array.from(node.classList||[]).filter(c=>/^[a-zA-Z_-][\w-]*$/.test(c)&&!/(?:\d{4}|^(?:css|sc)-[a-z0-9]{5,}|^(?:active|selected|hidden|visible)$)/i.test(c)).slice(0,3);
      let part=tag;
      const itemprop=node.getAttribute?.('itemprop'),testid=node.getAttribute?.('data-testid');
      if(itemprop==='price'){part+='[itemprop="price"]';semantic=true;}
      else if(testid&&/price|amount/i.test(testid)&&/^[a-zA-Z_-]+$/.test(testid)){part+='[data-testid="'+testid+'"]';semantic=true;}
      else if(classes.length){part+=classes.map(c=>'.'+c).join('');semantic=true;}
      else if(tag.includes('-'))semantic=true;
      parts.unshift(part);
      if(!semantic)continue;
      const selector=parts.join(' ');if(selector.length>500)break;
      let matches;try{matches=Array.from(document.querySelectorAll(selector)).filter(visible);}catch{continue;}
      if(matches.length===1&&matches[0]===target)return selector;
    }
    return '';
  }
  function pick(currencyOverride=null,learning=true) {
    return new Promise(resolve=>{
      const banner=document.createElement('div');
      banner.textContent='Game Shelf: click the current selling price.'+(learning?' Its layout will be remembered for this store.':'')+' Esc cancels.';
      banner.style.cssText='position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;padding:18px 24px;background:#163d30;color:white;font:16px system-ui;border:2px solid #71e6ac;border-radius:12px;pointer-events:none;box-shadow:0 8px 40px #0008';
      document.documentElement.append(banner);
      let highlighted=null, oldOutline='';
      function clean(){highlighted && (highlighted.style.outline=oldOutline);banner.remove();document.removeEventListener('mouseover',hover,true);document.removeEventListener('click',click,true);document.removeEventListener('keydown',key,true);clearTimeout(timer);}
      function hover(e){if(highlighted)highlighted.style.outline=oldOutline;highlighted=pickTarget(e.target,currencyOverride);oldOutline=highlighted.style.outline;highlighted.style.outline='2px solid #19ae73';}
      function key(e){if(e.key==='Escape'){clean();resolve(null);}}
      function click(e){
        e.preventDefault();e.stopImmediatePropagation();
        const target=pickTarget(e.target,currencyOverride);const parts=[];let el=target;
        while(el && el.nodeType===1){
          if(el.id){parts.unshift('#'+CSS.escape(el.id));break;}
          let part=el.tagName.toLowerCase();
          const cls=[...el.classList].filter(c=>/^[a-zA-Z_-][\w-]*$/.test(c)).slice(0,3);
          if(cls.length)part+='.'+cls.map(CSS.escape).join('.');
          if(el.parentElement){const siblings=[...el.parentElement.children].filter(x=>x.tagName===el.tagName);if(siblings.length>1)part+=`:nth-of-type(${siblings.indexOf(el)+1})`;}
          parts.unshift(part);el=el.parentElement;
        }
        const selector=parts.join(' > '), result=read(selector,location.href,currencyOverride);
        if(result.status!=='ok'){banner.textContent='That selection did not contain one complete price. Try the amount or its currency symbol. Esc cancels.';return;}
        clean();
        resolve({selector,result,learnedSelector:learnSelector(target,result.currency)});
      }
      document.addEventListener('mouseover',hover,true);document.addEventListener('click',click,true);document.addEventListener('keydown',key,true);
      const timer=setTimeout(()=>{clean();resolve(null);},60000);
    });
  }
  return {read,readStock,pick,priceText,priceElement,elementPrice,pickTarget,learnSelector};
})();
