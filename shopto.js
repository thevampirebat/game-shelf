/* This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. */
/* Inspect only ShopTo's currency links; the background performs bounded navigation. */
globalThis.GameShelfShopTo = (()=>{
  function product(raw){
    try{
      const u=new URL(raw),m=u.pathname.match(/^\/([a-z]{2})\/[^/]+-p(\d+)(?:\/(?:eur|gbp|usd)(?:\/[a-z]{2})?)?\/?$/i);
      if(u.protocol!=='https:'||!['shopto.net','www.shopto.net'].includes(u.hostname)||u.username||u.password||!m)return null;
      const query=[];u.searchParams.forEach((value,key)=>{if(!/^(utm_|ref|tag$|fbclid$|gclid$)/i.test(key))query.push([key,value]);});
      return {origin:u.origin,language:m[1].toLowerCase(),id:m[2],query:JSON.stringify(query.sort())};
    }catch{return null;}
  }
  function currencyURL(currency,pageURL=location.href){
    const current=product(pageURL);if(!current||currency!=='EUR')return null;
    const active=Array.from(document.querySelectorAll('#currency_switch li.active a')).map(e=>(e.textContent||'').trim());
    if(active.length&&active.every(t=>/^EUR\b/.test(t)))return null;
    for(const a of document.querySelectorAll('#currency_switch a')){
      if(!/^EUR\b/.test((a.textContent||'').trim()))continue;
      const href=a.getAttribute('href');if(!href||href==='#')continue;
      const u=new URL(href,pageURL),target=product(u.href);
      if(target&&target.origin===current.origin&&target.id===current.id&&target.language===current.language&&target.query===current.query&&/\/eur(?:\/|$)/i.test(u.pathname)){u.hash='';return u.href;}
    }
    return null;
  }
  return {product,currencyURL};
})();
