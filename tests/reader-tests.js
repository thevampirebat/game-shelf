/*
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at https://mozilla.org/MPL/2.0/.
*/
(async()=>{
  const output=document.querySelector('#results');output.textContent='';let pass=0,fail=0;
  const amazon='https://www.amazon.ie/dp/B0TEST1234',very='https://www.very.ie/game/123.prd',cex='https://ie.webuy.com/product-detail?id=123';
  const schema=p=>`<script type="application/ld+json">${JSON.stringify(p)}</script>`;
  const product={"@type":"Product",name:'Example game',offers:{"@type":"Offer",price:'39.99',priceCurrency:'EUR',availability:'https://schema.org/InStock'}};
  const cases=[
    ['Amazon ignores list price and recommendations',amazon,'<h1 id="productTitle">Game</h1><div id="corePriceDisplay_desktop_feature_div"><div class="a-price a-text-price"><span class="a-offscreen">€69.99</span></div><div class="a-price"><span class="a-offscreen">€39.99</span></div></div><div class="a-price"><span class="a-offscreen">€9.99</span></div>',{status:'ok',cents:3999}],
    ['Amazon wrong currency fails',amazon,'<div id="corePrice_feature_div"><div class="a-price"><span class="a-offscreen">£39.99</span></div></div>',{status:'error'}],
    ['Amazon verification blocks price reading',amazon,'<h1>Verify you are human</h1><div id="corePrice_feature_div"><div class="a-price"><span class="a-offscreen">€19.99</span></div></div>',{status:'blocked'}],
    ['Amazon out of stock is not zero',amazon,'<div id="availability">Currently unavailable.</div>',{status:'unavailable'}],
    ['Amazon selected variant must match URL',amazon,'<input id="ASIN" value="B0OTHER123"><div id="corePrice_feature_div"><div class="a-price"><span class="a-offscreen">€19.99</span></div></div>',{status:'error'}],
    ['Very reads single product offer',very,schema(product),{status:'ok',cents:3999}],
    ['Smyths reads Irish product offer','https://www.smythstoys.com/ie/en-ie/game/p/123',schema(product),{status:'ok',cents:3999}],
    ['CeX retail label ignores cash and voucher',cex,'<h1>Game</h1><p>We sell for €30.00</p><p>We buy for cash €12.00</p><p>We buy for voucher €18.00</p>',{status:'ok',cents:3000}],
    ['CeX trade-in only never becomes retail price',cex,'<h1>Game</h1><p>We buy for cash €12.00</p><p>We buy for voucher €18.00</p>',{status:'error'}],
    ['Ambiguous offers rejected',very,schema({...product,offers:[product.offers,{...product.offers,price:'19.99'}]}),{status:'error'}],
    ['Aggregate low-price ranges rejected',very,schema({...product,offers:{'@type':'AggregateOffer',lowPrice:'10',highPrice:'30',priceCurrency:'EUR'}}),{status:'error'}],
    ['Recommended ItemList ignored',very,schema({'@type':'ItemList',itemListElement:[product]}),{status:'error'}],
    ['Unavailable structured offer retained as unavailable',very,schema({...product,offers:{...product.offers,availability:'https://schema.org/OutOfStock'}}),{status:'unavailable'}],
    ['Manually picked single price',cex,'<div id="retail">€24.99</div><div>Cash €9.00</div>',{status:'ok',cents:2499},'#retail'],
    ['Picked container with two prices rejected',cex,'<div id="retail">Was €39.99 now €24.99</div>',{status:'error'},'#retail'],
    ['Disappeared selector rejected',cex,'<div>€24.99</div>',{status:'error'},'#retail']
  ];
  for(const [name,url,html,expected,selector] of cases){
    const frame=document.createElement('iframe');document.body.append(frame);
    await new Promise(resolve=>{frame.onload=resolve;frame.srcdoc=`<!doctype html><html><body>${html}<script src="../core.js"></script><script src="../reader.js"></script></body></html>`;});
    try{const result=frame.contentWindow.GameShelfReader.read(selector||'',url);if(Object.entries(expected).some(([k,v])=>result[k]!==v))throw Error(JSON.stringify(result));output.textContent+='PASS '+name+'\n';pass++;}catch(e){output.textContent+='FAIL '+name+': '+e.message+'\n';fail++;}
    frame.remove();
  }
  output.textContent+=`\n${pass} passed; ${fail} failed.`;
})();
