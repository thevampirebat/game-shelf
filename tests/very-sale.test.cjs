/*
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at https://mozilla.org/MPL/2.0/.
*/
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),cp=require('node:child_process');
require('../core.js');
const html=fs.readFileSync(__dirname+'/fixtures/very-sale-price.html','utf8');
const python=process.env.PYTHON||(process.platform==='win32'?'python':'python3');
const tree=JSON.parse(cp.execFileSync(python,['-X','utf8','-c',`import sys,json,xml.etree.ElementTree as E
r=E.fromstring(sys.stdin.read())
def node(e):return {'tag':e.tag,'attrs':e.attrib,'text':''.join(e.itertext()),'children':[node(c) for c in e]}
print(json.dumps(node(r)))`],{input:html,encoding:'utf8'}));
function wrap(t,parent=null){
 const n={tagName:t.tag.toUpperCase(),textContent:t.text,parentElement:parent,getAttribute:k=>t.attrs[k]??null,getClientRects:()=>[{}]};
 n.matches=selector=>selector.split(',').some(s=>{const a=s.match(/^\[data-testid="([^"]+)"\]$/);return a?t.attrs['data-testid']===a[1]:s===t.tag;});
 n.closest=selector=>n.matches(selector)?n:parent?.closest(selector)||null;
 n.children=t.children.map(c=>wrap(c,n));
 n.querySelectorAll=selector=>n.children.flatMap(c=>[...(c.matches(selector)?[c]:[]),...c.querySelectorAll(selector)]);
 n.querySelector=selector=>n.querySelectorAll(selector)[0]||null;
 return n;
}
const box=wrap(tree),basic=box.querySelector('[data-testid="product-price__basic"]'),previous=box.querySelector('[data-testid="product-price__prev"]'),saving=box.querySelector('[data-testid="product-price__save"]');
const document={title:'Killing Floor 3',body:{innerText:box.textContent},querySelector:()=>null,querySelectorAll:s=>s==='#picked'?[basic]:s==='#box'?[box]:s==='#previous'?[previous]:s==='#saving'?[saving]:s==='#product-detail [data-testid="product-price__basic"]'?[basic]:[]};
const ctx=vm.createContext({Shelf,document,location:{href:'https://www.very.ie/xbox-killing-floor-3-day-one-edition-xbox-series-x/1601221128.prd'},getComputedStyle:()=>({display:'block',visibility:'visible'})});
vm.runInContext(fs.readFileSync(__dirname+'/../reader.js','utf8'),ctx);
const R=ctx.GameShelfReader;
for(const selector of ['','#picked','#box']){const r=R.read(selector);assert.equal(r.status,'ok',JSON.stringify(r));assert.equal(r.cents,1799);}
assert.equal(R.pickTarget(basic.children[0]),basic);
assert.equal(R.read('#previous').status,'error');
assert.equal(R.read('#saving').status,'error');
basic.textContent='Current price is €33.99';assert.equal(R.read('#picked').cents,3399);
basic.textContent='Current sale price is €17.99 €19.99';assert.equal(R.read('#picked').status,'error');
console.log('PASS live Very sale markup: automatic/picked/parent price €17.99, screen-reader span, regular price, ambiguous rejection, savings and previous amount rejected');
