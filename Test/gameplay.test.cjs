const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function game() {
  const nodes = new Map();
  function element() {
    return {textContent: '', children: [], hidden: true, dataset: {}, style: {},
      append(...items) { this.children.push(...items); },
      replaceChildren(...items) { this.children = items; },
      querySelector() { return element(); },
      toggleAttribute() {}, scrollIntoView() {}};
  }
  const context = vm.createContext({
    console, setInterval, clearInterval,
    document: {createElement: element, getElementById: id => { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); }, querySelectorAll: () => []},
    MoneyLifeSnapshot: require('../Engine/src/snapshot.cjs'),
    $: id => { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); },
    serverPlanBusy: false, serverPlanId: null,
    eventRequests: {get: () => null, isSuspended: () => false},
    localStorage: {removeItem() {}},
    show: (html, scene) => { context.modal = html; context.scene = scene; }, closeModal() {},
    toast: text => { context.notice = text; },
    render() {}, mlShowPage: page => { context.page = page; },
    mlFormatAmount: value => Math.round(value).toLocaleString("ko-KR"),
    mlFormatMan: value => Math.round(value * 10000).toLocaleString("ko-KR") + "원",
    money: value => Math.round(value * 10000).toLocaleString('ko-KR') + '원',
    dates: month => `${month}개월차`, escapeHtml: String,
    nextEvent: () => { context.nextCalled = true; }, step: () => { context.stepped = true; }, compare() {},
  });
  const load = file => vm.runInContext(readFileSync(path.join(__dirname, '../Client/src', file), 'utf8'), context);
  for (const file of ['icons.js', 'money-input.js', 'plan-state.js', 'journey-defaults.js', 'journey-store.js', 'journey-simulation.js', 'dashboard-screen.js', 'finance-screen.js', 'gameplay.js', 'report-screen.js']) load(file);
  context.render = () => {};
  vm.runInContext(`EV = {12: {emoji:'🏡', title:'독립',body:'독립 준비',a:'독립하기',b:'더 준비하기'}};`, context);
  return {context, nodes, load, run: code => vm.runInContext(code, context)};
}

test('출발 화면과 새 조건 확인 단계는 진행 중인 여정을 변경하지 않는다', () => {
  const {context, run} = game();
  run('JourneyStore.set("month", 8)');
  const before = run('JSON.stringify(JourneyStore.snapshot())');
  run('showJourneyStart(); confirmJourneyStart("home")');
  assert.match(context.modal, /현재 기기의 여정은 새 조건으로/);
  assert.equal(run('JSON.stringify(JourneyStore.snapshot())'), before);
});

test('새 출발은 명시적 확정 후 공용 재무 입력 경로로 적용한다', () => {
  const {nodes, run} = game();
  run('confirmJourneyStart("home")');
  nodes.get('game-confirm-start').onclick();
  assert.equal(run('JourneyStore.current.start.target'), 5000);
  assert.equal(run('JourneyStore.current.start.income'), 300);
  assert.equal(run('JourneyStore.current.goalMonths'), 36);
  assert.equal(run('simulate()[0].total'), 1500);
});

test('미확인 이벤트 요청과 서버 작업 중에는 새 출발을 막는다', () => {
  const {context, run} = game();
  const before = run('JSON.stringify(JourneyStore.snapshot())');
  context.eventRequests.get = () => ({requestId: 'pending'});
  run('confirmJourneyStart("first")');
  assert.match(context.notice, /미확인 선택/);
  assert.equal(run('JSON.stringify(JourneyStore.snapshot())'), before);
  context.eventRequests.get = () => null;
  context.serverPlanBusy = true;
  run('confirmJourneyStart("first")');
  assert.equal(context.modal, undefined);
});

test('월 결산의 순자산 증감은 공용 엔진의 실제 결과와 같다', () => {
  const {nodes, run} = game();
  run('JourneyStore.set("month", 1); renderGameplay(simulate())');
  const receipt = nodes.get('game-month-receipt');
  assert.equal(receipt.children[0].children[1].textContent, '2,500,000원');
  assert.equal(receipt.children[1].children[1].textContent, '1,600,000원');
  assert.equal(receipt.children[2].children[1].textContent, run('money(simulate()[1].total - simulate()[0].total)'));
});

test('부족한 생활비·결정할 이벤트·10년 종료를 구분해서 표시한다', () => {
  const {nodes, run} = game();
  run('JourneyStore.set("start", {...JourneyStore.current.start,cash:0,saved:0,income:0}); JourneyStore.set("month",1); renderGameplay(simulate())');
  assert.match(nodes.get('game-story-title').textContent, /생활비가 부족/);
  assert.match(nodes.get('game-month-receipt').children.at(-1).textContent, /생활비 부족액/);
  run('JourneyStore.set("month",12); renderGameplay(simulate())');
  assert.match(nodes.get('game-story-title').textContent, /갈림길/);
  run('JourneyStore.set("month",120); renderGameplay(simulate())');
  assert.equal(nodes.get('game-turn').textContent, 'FINISH');
});

test('장소 미리보기는 시간을 건너뛰지 않고 기존 이벤트 진행을 호출한다', () => {
  const {context, nodes, run} = game();
  run('openLifePlace("home")');
  assert.equal(run('JourneyStore.current.month'), 0);
  nodes.get('game-place-next').onclick();
  assert.equal(context.nextCalled, true);
});

test('선택 결과는 다음 달 반영을 설명하고 현재 자산을 변경하지 않는다', () => {
  const {nodes, run} = game();
  run('JourneyStore.set("month",12)');
  const before = run('JSON.stringify(JourneyStore.snapshot())');
  run('showChoiceResult(simulate(), simulate([...JourneyStore.current.mods,{type:"once",v:300,m:13}]),12,true)');
  assert.equal(nodes.get('game-choice-result').hidden, false);
  assert.match(nodes.get('game-choice-result').children[1].textContent, /-3,000,000원/);
  assert.match(nodes.get('game-choice-result').children[1].textContent, /다음 달부터/);
  assert.equal(run('JSON.stringify(JourneyStore.snapshot())'), before);
});

test('리포트는 1만원 미만의 차이도 원 단위로 표시한다', () => {
  const {nodes, run} = game();
  run('mlDrawChart = () => true; const base = simulate(); const current = base.map(row => ({...row,total:row.total + 0.01})); mlRenderReport({base,current,stress:current})');
  assert.equal(nodes.get('ml-report-net-difference').textContent, '100원 증가');
  assert.match(run('mlCompareNetWorth(0.01,"처음 계획")'), /100원/);
});


test('선택 결과에서 다음 달로 진행하고 재렌더링하면 이야기 장면으로 복귀한다', () => {
  const {context, nodes, run} = game();
  run('JourneyStore.set("month",12); showChoiceResult(simulate(),simulate(),12,false)');
  assert.equal(nodes.get('play-dialogue').hidden, true);
  nodes.get('game-choice-result').children[3].children[0].onclick();
  assert.equal(context.stepped, true);
  run('renderGameplay(simulate())');
  assert.equal(nodes.get('play-dialogue').hidden, false);
  assert.equal(nodes.get('game-choice-result').hidden, true);
});

test('이벤트 장면은 승인 전에 미래를 비교하며 현재 조건을 보존한다', () => {
  const {context, load, run} = game();
  load('journey-events.js');
  run('EV = {12:{emoji:"🏡",title:"독립",body:"독립 준비",a:"독립하기",b:"더 준비하기",ad:"이사비 300만 원",bd:"유지",rule:{kind:"effects",effects:[{type:"once",value:3000000}]}}}; JourneyStore.set("month",12)');
  const before = run('JSON.stringify(JourneyStore.snapshot())');
  run('eventPreview(12)');
  assert.equal(context.scene, 'event');
  assert.match(context.modal, /다음 달 순자산 차이 -3,000,000원/);
  assert.match(context.modal, /aria-label="독립하기"/);
  assert.equal(run('JSON.stringify(JourneyStore.snapshot())'), before);
});
