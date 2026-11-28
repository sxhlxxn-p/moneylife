const {test} = require('node:test');
const assert = require('node:assert/strict');
const story = require('../Client/src/life-story.js');
const catalog = require('../Shared/life-events.json');
const engine = require('../Engine/src/snapshot.cjs');
function state(month = 0) {
  return {initial:{name:'나의 여정',age:25,cash:3000000,saved:7000000,income:2500000,expense:1600000,target:50000000},goal:{name:'내 공간',months:60},monthlySaving:700000,annualRate:3,month,events:[],logs:[],changes:[],rateChanges:[]};
}
function path(s) {return engine.calculateSnapshot(s).monthlyResults.map(row => Object.fromEntries(Object.entries(row).map(([key,value]) => [key,key==='month'?value:value/10000])));}
function choose(s, month, accepted) {
  const event=catalog.events.find(item=>item.month===month);
  s.events.push(month);s.logs.unshift({month,text:accepted?event.a:event.b});
}
test('생활 장면은 실제 선택 다음 달부터 바뀌고 휴식은 3개월 뒤 끝난다',()=>{
  const s=state(12);choose(s,12,true);
  assert.equal(story.life(s,catalog).home,'family');
  s.month=13;assert.equal(story.life(s,catalog).home,'independent');
  choose(s,30,true);
  for(const month of [31,32,33]){s.month=month;assert.equal(story.life(s,catalog).work,'rest');}
  s.month=34;assert.equal(story.life(s,catalog).work,'steady');
  choose(s,48,true);s.month=49;assert.equal(story.life(s,catalog).work,'newjob');
  choose(s,72,true);s.month=73;assert.equal(story.life(s,catalog).travelling,true);
  s.month=74;assert.equal(story.life(s,catalog).travelling,false);assert.equal(story.life(s,catalog).travelled,true);
  choose(s,96,true);s.month=97;assert.equal(story.life(s,catalog).learning,true);
});
test('두 번째 선택을 고르면 집·직장 변화와 보상을 만들어내지 않는다',()=>{
  const s=state(97);for(const month of [12,30,48,72,96])choose(s,month,false);
  const before=structuredClone(s),life=story.life(s,catalog);
  assert.deepEqual([life.home,life.work,life.travelled,life.learning],['family','steady',false,false]);
  assert.deepEqual(s,before);
});
test('작은 목표는 실제 순자산으로만 달성하고 미래 달성을 미리 완료하지 않는다',()=>{
  const s=state(),rows=path(s),before=structuredClone(s);
  const first=story.missions(s,rows)[0];
  assert.equal(first.target,11000000);assert.equal(first.complete,false);assert.equal(first.hit,null);
  s.month=1;assert.equal(story.missions(s,rows)[0].complete,false);
  s.month=2;assert.equal(story.missions(s,rows)[0].complete,true);
  assert.equal(story.missions(s,rows)[0].hit,2);
  assert.equal(s.initial.target,before.initial.target);
  assert.deepEqual(s.changes,[]);
});
test('아주 작은 목표·이미 달성한 목표에서도 중복 단계나 잘못된 진행률을 만들지 않는다',()=>{
  for(const target of [1,10000000,10000001,10000002,10000003,10000000000]){
    const s=state();s.initial.target=target;const missions=story.missions(s,path(s));
    assert.equal(new Set(missions.map(item=>item.target)).size,missions.length);
    assert.equal(missions.at(-1).target,target);
    assert.ok(missions.every(item=>Number.isFinite(item.progress)&&item.progress>=0&&item.progress<=1));
  }
});
test('선택 이력에 따라 다음 이야기의 맥락이 달라지며 금액과 규칙은 그대로 둔다',()=>{
  const independent=state(30),family=state(30);choose(independent,12,true);choose(family,12,false);
  const before=structuredClone(independent);
  assert.match(story.context(independent,catalog,30).text,/독립을 선택/);
  assert.match(story.context(family,catalog,30).text,/함께 살며/);
  assert.deepEqual(independent,before);
  independent.logs=[];assert.equal(story.context(independent,catalog,30),null);
  assert.equal(story.decisions(independent,catalog)[0].accepted,null);
  independent.month=31;
  assert.equal(story.life(independent,catalog).home,'unknown');
});

test('선택지의 생활 설명과 10년의 결말은 앞선 선택을 이어받는다',()=>{
  const s=state(30);choose(s,12,true);
  assert.match(story.choiceOutcome(30,true,s,catalog),/내 공간/);
  const family=state(30);choose(family,12,false);
  assert.match(story.choiceOutcome(30,true,family,catalog),/함께 사는 집/);
  s.month=120;choose(s,72,true);
  assert.match(story.ending(s,catalog),/내 공간과 새로운 경험/);
  family.month=120;for(const month of [30,48,72,96])choose(family,month,false);
  assert.match(story.ending(family,catalog),/익숙한 일상/);
});
test('월말 저축 이동은 이자를 제외한 실제 현금 이동이며 부족한 달에는 0원이다',()=>{
  const s=state(),rows=path(s);
  const receipt=story.receipt(rows,1);
  assert.equal(receipt.transfer,700000);
  assert.equal(receipt.income,2500000);assert.equal(receipt.expense,1600000);
  assert.equal(receipt.change,engine.calculateSnapshot(s).monthlyResults[1].total-10000000);
  assert.notEqual(Math.round((rows[1].saved-rows[0].saved)*10000),receipt.transfer);
  s.initial.cash=0;s.initial.income=0;
  assert.equal(story.receipt(path(s),1).transfer,0);
});

test('설정 기록이 많아도 인생 선택을 보존하고 새 선택을 저장할 자리를 남긴다',()=>{
  const choice={month:12,text:catalog.events[0].a};
  const logs=[...Array.from({length:95},(_,i)=>({month:13,text:'조건 변경 '+i})),choice];
  const before=structuredClone(logs);
  const kept=story.retainLogs(logs,catalog,79);
  assert.equal(kept.length,79);assert.ok(kept.includes(choice));
  assert.equal(kept[0].text,'조건 변경 0');
  const afterServer=[{month:30,text:catalog.events[1].b},...kept].slice(0,80);
  assert.equal(story.decisions({...state(31),events:[12,30],logs:afterServer},catalog)[0].accepted,true);
  assert.deepEqual(logs,before);
});

test('목표 첫 도달 후 적자가 나면 현재의 음수 순자산과 첫 도달 기록을 함께 유지한다',()=>{
  const s=state(3);s.initial.target=11000000;s.changes=[{type:'once',v:20000000,m:3,end:null}];
  const rows=path(s),goal=story.missions(s,rows).at(-1);
  assert.equal(goal.complete,true);assert.equal(goal.hit,2);
  assert.ok(goal.amount<0);assert.equal(goal.progress,0);
  assert.equal(goal.amount,Math.round(rows[3].total*10000));
});
