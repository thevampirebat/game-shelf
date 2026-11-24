/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. https://mozilla.org/MPL/2.0/. */
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
require('../core.js');
const node=(value,hidden=false,crossed=false)=>({textContent:value,tagName:'SPAN',getAttribute:()=>null,closest:s=>crossed&&s.includes('.a-text-price')?{}:null,matches:()=>false,getClientRects:()=>hidden?[]:[{}]});
let slots={};
const document={title:'Quantum of Solace',body:{innerText:''},querySelector:()=>null,querySelectorAll:s=>slots[s]||[]};
const ctx=vm.createContext({Shelf,document,location:{href:'https://www.amazon.co.uk/dp/B0TEST1234'},getComputedStyle:()=>({display:'inline',visibility:'visible'})});
vm.runInContext(fs.readFileSync(__dirname+'/../reader.js','utf8'),ctx);
const read=()=>ctx.GameShelfReader.read();
const center='#corePriceDisplay_desktop_feature_div .priceToPay .a-offscreen';
slots={'#newBuyBoxPrice':[node('EUR17.87')],[center]:[node('EUR32.75')],'#usedBuySection .a-price':[node('EUR4.76')]};
assert.equal(read().cents,1787);assert.match(read().source,/Buy New/);
slots['#newBuyBoxPrice']=[node('EUR17.87',true)];assert.equal(read().cents,3275);
slots['#newBuyBoxPrice']=[node('EUR17.87'),node('EUR18.87')];assert.equal(read().status,'error');
slots['#newBuyBoxPrice']=[node('EUR32.75',false,true)];assert.equal(read().cents,3275);
slots['#newBuyBoxPrice']=[node('£17.87')];assert.equal(read().currency,'GBP');
slots={'#usedBuySection .a-price':[node('EUR4.76')]};assert.equal(read().status,'error');
slots={'#newBuyBoxPrice':[node('EUR17.87')],'#picked':[node('EUR20.00')]};
assert.equal(ctx.GameShelfReader.read('#picked').cents,2000,'manual price selection remains explicit');
console.log('PASS Buy New priority, hidden/previous-price exclusion, currency, ambiguity, no used-price fallback and manual override');
