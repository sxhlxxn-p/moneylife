const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function chart() {
  const make = tag => ({tagName:tag,children:[],attrs:{},listeners:{},textContent:'',
    setAttribute(key,value){this.attrs[key]=String(value);},
    addEventListener(key,fn){this.listeners[key]=fn;},
    append(...items){this.children.push(...items);},
    replaceChildren(...items){this.children=items;},
  });
  const paper = {node(tag,text,className){const el=make(tag); if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;},
    won:n=>n.toLocaleString('ko-KR')+'원',signed:n=>(n>0?'+':'')+n.toLocaleString('ko-KR')+'원',
    dataLabel:()=> '가상 가격',marketDate:(_,month)=>`${month}개월차`};
  const context = vm.createContext({document:{createElementNS:(_,tag)=>({...make(tag),namespaceURI:'http://www.w3.org/2000/svg'})},paper});
  vm.runInContext(readFileSync(path.join(__dirname,'../Client/src/paper-market-chart.js'),'utf8'),context);
  vm.runInContext('installPaperMarketChart(paper)',context);
  const rows = [10000,12000,11000].map((price,month)=>({month,investment:{price,priceMonth:month,quantity:0,averageCost:null,stale:false}}));
  const plan = {month:2,source:{symbol:'TEST-KRW'}};
  const invested = {monthlyResults:rows,executions:[]};
  const walk=(node,fn)=>[...(fn(node)?[node]:[]),...node.children.flatMap(child=>walk(child,fn))];
  return {paper,context,plan,invested,walk};
}

test('주가 창은 현재 월 이후를 제외하고 전달받은 과거 가격만 사용한다',()=>{
  const {context}=chart();
  const result=vm.runInContext('paperPriceWindow([{month:0,investment:{price:100,priceMonth:0}},{month:1,investment:{price:200,priceMonth:1}},{month:2,investment:{price:9999,priceMonth:2}}],1)',context);
  assert.deepEqual(JSON.parse(JSON.stringify(result)),[{month:0,price:100},{month:1,price:200}]);
});

test('이전 가격으로 평가한 월은 새 관측값처럼 차트에 반복하지 않는다',()=>{
  const {context}=chart();
  const result=vm.runInContext('paperPriceWindow([{month:2,investment:{price:100,priceMonth:1}},{month:3,investment:{price:null,priceMonth:null}}],3)',context);
  assert.deepEqual(JSON.parse(JSON.stringify(result)),[{month:2,price:null},{month:3,price:null}]);
});

test('주가와 원화 축을 표시하고 슬라이더로 월별 가격을 탐색한다',()=>{
  const {paper,plan,invested,walk}=chart();
  const panel=paper.marketChart(plan,invested);
  const slider=walk(panel,n=>n.className==='stock-scrubber')[0];
  const readout=walk(panel,n=>n.className==='stock-readout')[0];
  assert.match(readout.textContent,/2개월차 · 11,000원/);
  slider.value='0';slider.oninput();assert.match(readout.textContent,/0개월차 · 10,000원/);
  assert.equal(walk(panel,n=>n.attrs.class==='stock-grid').length,5);
  assert.ok(walk(panel,n=>n.attrs.class==='stock-axis').length>=6);
  for(const node of walk(panel,n=>n.attrs.d))assert.doesNotMatch(node.attrs.d,/NaN|Infinity/);
});

test('가격 누락 구간을 연결하지 않고 체결된 주문만 차트에 표시한다',()=>{
  const {paper,plan,invested,walk}=chart();
  invested.monthlyResults[1].investment={price:10000,priceMonth:0,quantity:0,averageCost:null,stale:true};
  invested.executions=[{status:'filled',executionMonth:0,price:10000,order:{side:'buy'}},{status:'rejected',executionMonth:2,price:11000,order:{side:'sell'}}];
  const panel=paper.marketChart(plan,invested);
  assert.equal(walk(panel,n=>n.attrs.class==='stock-price-line').length,2);
  assert.equal(walk(panel,n=>n.attrs.class==='stock-buy-mark').length,1);
  assert.equal(walk(panel,n=>n.attrs.class==='stock-sell-mark').length,0);
});

test('한 개 가격과 관측값 없는 구간도 허위 추세 없이 표시한다',()=>{
  const {paper,plan,invested,walk}=chart();
  plan.month=0;invested.monthlyResults=invested.monthlyResults.slice(0,1);
  let panel=paper.marketChart(plan,invested);
  assert.equal(walk(panel,n=>n.attrs.class==='stock-price-dot').length,1);
  assert.equal(walk(panel,n=>n.className==='stock-scrubber')[0].disabled,true);
  invested.monthlyResults[0].investment.price=null;
  panel=paper.marketChart(plan,invested);
  assert.equal(walk(panel,n=>n.className==='stock-no-data').length,1);
});

test('6개월 범위는 진행한 월에서만 잘라내고 최신 가격은 유지한다',()=>{
  const {paper,plan,invested,walk}=chart();
  plan.month=14; invested.monthlyResults=Array.from({length:15},(_,month)=>({month,investment:{price:10000+month,priceMonth:month,quantity:0,averageCost:null,stale:false}}));
  const panel=paper.marketChart(plan,invested);
  walk(panel,n=>n.tagName==='button'&&n.textContent==='6개월')[0].listeners.click();
  assert.equal(walk(panel,n=>n.className==='stock-scrubber')[0].max,'5');
  assert.match(walk(panel,n=>n.className==='stock-readout')[0].textContent,/14개월차/);
  assert.equal(walk(panel,n=>n.tagName==='svg')[0].attrs['aria-label'],'TEST-KRW · 9~14개월의 월별 종가 차트');
});

test('차트뿐 아니라 큰 현재가 표시에도 미래 월 결과를 사용하지 않는다',()=>{
  const {paper,plan,invested,walk}=chart();
  invested.monthlyResults.push({month:3,investment:{price:999999,priceMonth:3,quantity:0,averageCost:null,stale:false}});
  const panel=paper.marketChart(plan,invested);
  assert.equal(walk(panel,n=>n.className==='stock-quote')[0].children[0].textContent,'11,000원');
});
