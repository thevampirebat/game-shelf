/*
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at https://mozilla.org/MPL/2.0/.
*/
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),cp=require('node:child_process');
require('../core.js');
const html='<span class="a-price aok-align-center reinventPricePriceToPayMargin priceToPay apex-pricetopay-value" data-a-size="xl" data-a-color="base"><span class="a-offscreen"> </span><span aria-hidden="true"><span class="a-price-symbol">EUR</span><span class="a-price-whole">42<span class="a-price-decimal">.</span></span><span class="a-price-fraction">91</span></span></span>';
// Parse the exact supplied HTML, then expose only the DOM operations used by this fixture.
const python=process.env.PYTHON||(process.platform==='win32'?'python':'python3');
const tree=JSON.parse(cp.execFileSync(python,['-X','utf8','-c',`import sys,json,xml.etree.ElementTree as E
r=E.fromstring(sys.stdin.read())
def node(e):return {'tag':e.tag,'attrs':e.attrib,'text':''.join(e.itertext()),'children':[node(c) for c in e]}
print(json.dumps(node(r)))`],{input:html,encoding:'utf8'}));
function wrap(t,parent=null){
 const n={tagName:t.tag.toUpperCase(),textContent:t.text,parentElement:parent,getAttribute:k=>t.attrs[k]||null,getClientRects:()=>[{}]};
 n.matches=selector=>selector.split(',').some(s=>s.startsWith('.')?s.slice(1).split('.').every(c=>(t.attrs.class||'').split(' ').includes(c)):s===t.tag);
 n.closest=selector=>n.matches(selector)?n:parent?.closest(selector)||null;
 n.children=t.children.map(c=>wrap(c,n));
 n.querySelectorAll=selector=>n.children.flatMap(c=>[...(c.matches(selector)?[c]:[]),...c.querySelectorAll(selector)]);
 n.querySelector=selector=>n.querySelectorAll(selector)[0]||null;
 return n;
}
const price=wrap(tree), product={textContent:'007 First Light',getAttribute:()=>null},prime={textContent:'Enjoy Prime now, decide later',getAttribute:()=>null};
const document={title:'007 First Light - Amazon.co.uk',body:{innerText:'EUR42.91'},querySelector:s=>s==='#productTitle'?product:s==='h1'||s==='#productTitle,h1'?prime:null,querySelectorAll:s=>s==='#picked'? [price.querySelector('.a-price-whole')]:s==='.apex-pricetopay-value.priceToPay'?[price]:[]};
const ctx=vm.createContext({Shelf:globalThis.Shelf,document,location:{href:'https://www.amazon.co.uk/dp/B0TEST1234'},getComputedStyle:()=>({display:'inline',visibility:'visible'})});
vm.runInContext(fs.readFileSync(__dirname+'/../reader.js','utf8'),ctx);
const R=ctx.GameShelfReader;
const picked=R.read('#picked');assert.equal(picked.status,'ok',JSON.stringify(picked));assert.equal(picked.cents,4291);assert.equal(picked.currency,'EUR');
assert.equal(picked.title,'007 First Light');
const auto=R.read();assert.equal(auto.status,'ok',JSON.stringify(auto));assert.equal(auto.cents,4291);assert.equal(auto.currency,'EUR');
console.log('PASS exact supplied HTML: EUR 42.91, automatic and picked extraction, product title beats Prime heading');
Shelf.configureStores([{name:'Custom store',host:'shop.example.ie',currency:'EUR'}]);
const customURL='https://shop.example.ie/item';
assert.equal(R.read('',customURL).status,'error');
const customPicked=R.read('#picked',customURL);assert.equal(customPicked.status,'ok');assert.equal(customPicked.cents,4291);assert.equal(customPicked.store,'custom:shop.example.ie');
console.log('PASS custom store requires a selector and reads its picked EUR price');
