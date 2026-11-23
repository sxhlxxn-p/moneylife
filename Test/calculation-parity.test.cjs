const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const codec=require('../Client/src/plan-state');
const {calculateSnapshot}=require('../Engine/src/snapshot.cjs');

function preview(game){
 const context=vm.createContext({JourneyStore:{current:game,snapshot:()=>codec.encode(game)}});
 for(const file of ['node_modules/decimal.js/decimal.js','Engine/src/index.js','Engine/src/interest.cjs','Engine/src/snapshot.cjs','Client/src/journey-simulation.js'])
  vm.runInContext(fs.readFileSync(require('node:path').resolve(__dirname,'..',file),'utf8'),context);
 return JSON.parse(vm.runInContext('JSON.stringify(simulate())',context));
}
function game(overrides={}){return {start:{name:'검증',age:25,avatar:'test',cash:989.9753,saved:10,income:0,expense:0,target:1000},baseSaving:0,baseRate:3,month:0,mods:[],rateMods:[],logs:[],events:new Set(),...overrides};}

test('화면에 목표 금액이 표시된 첫 달과 서버 목표 달성 월이 일치한다',()=>{
 const input=game(),rows=preview(input),server=calculateSnapshot(codec.encode(input));
 assert.equal(Math.round(rows[1].total*10000),10000000);
 assert.equal(rows.findIndex(row=>row.total>=input.start.target),server.summary.goalMonth);
 assert.equal(server.summary.goalMonth,1);
});

test('120개월의 금액·부족액·기간 변경을 브라우저와 서버에서 동일하게 계산한다',()=>{
 for(const annualRate of [0,3,12.5,100]){
 const input=game({baseRate:annualRate,mods:[{type:'once',v:1200,m:3},{type:'income',v:10,m:5,end:8}],rateMods:[{m:10,v:2.5}]});
 const rows=preview(input),server=calculateSnapshot(codec.encode(input));
 for(const [index,row] of server.monthlyResults.entries())for(const field of ['cash','saved','unpaid','total','income','expense','short'])
  assert.equal(Math.round(rows[index][field]*10000),row[field],`${annualRate}:${index}:${field}`);
 }
});
