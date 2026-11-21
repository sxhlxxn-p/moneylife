const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = file => fs.readFileSync(path.join(__dirname, '../Client/src', file), 'utf8');

function journey() {
  const context = vm.createContext({});
  vm.runInContext(source('journey-defaults.js') + source('journey-store.js'), context);
  return script => vm.runInContext(script, context);
}

test('다른 화면이 읽은 자산·변경 기록을 직접 수정해도 현재 상태는 바뀌지 않는다', () => {
  const run = journey();
  run('JourneyStore.current.start.income = 0');
  assert.equal(run('JourneyStore.current.start.income'), 250);
  assert.throws(() => run('JourneyStore.current.mods.push({type:"income",v:1})'));
  run('JourneyStore.current.events.add(12)');
  assert.equal(run('JourneyStore.current.events.has(12)'), false);
  run('JourneyStore.set("start", {...JourneyStore.current.start, income:100})');
  assert.equal(run('JourneyStore.current.start.income'), 100);
});

test('변경 기록 추가는 이전 스냅샷을 보존하고 상태 API를 통해서만 적용된다', () => {
  const run = journey();
  run('const previous = JourneyStore.current.mods; JourneyStore.mutate("mods", "push", {type:"expense",v:30,m:13});');
  assert.equal(run('previous.length'), 0);
  assert.equal(run('JourneyStore.current.mods.length'), 1);
  run('JourneyStore.mutate("events", "add", 12)');
  assert.equal(run('JourneyStore.current.events.has(12)'), true);
});

function storage() {
  const values = new Map();
  return {getItem:k=>values.get(k) ?? null, setItem:(k,v)=>values.set(k,v), removeItem:k=>values.delete(k)};
}
function queue(storage) {
  const context = vm.createContext({storage});
  return vm.runInContext(source('request-journal.js') + source('paper-requests.js') + '\ncreatePaperRequests(storage)', context);
}

test('응답 유실 뒤 페이지를 다시 열어도 같은 주문 요청 ID를 복원한다', () => {
  const saved = storage();
  const request = {action:'orders', parentId:'a'.repeat(36), body:{requestId:'same-order-id', side:'buy',quantity:1}};
  queue(saved).stage(request);
  const restored = queue(saved);
  assert.equal(restored.get().body.requestId, 'same-order-id');
  restored.clear();
  assert.equal(queue(saved).get(), null);
});

test('브라우저 저장 실패 시 보내면 복구할 수 없는 주문을 보관하지 않는다', () => {
  const saved = storage();
  saved.setItem = () => {throw new Error('Storage unavailable');};
  const requests = queue(saved);
  assert.throws(() => requests.stage({action:'create',body:{requestId:'one'}}));
  assert.equal(requests.get(), null);
});

test('저장 자료의 임의 경로 명령은 재실행하지 않는다', () => {
  const saved = storage();
  saved.setItem('money-life-paper-pending', JSON.stringify({action:'../../secret',body:{requestId:'one'}}));
  assert.equal(queue(saved).get(), null);
});

test('세션을 바꾸면 이전 모의투자 요청을 별도 보관한 뒤 새 요청을 시작할 수 있다', () => {
  const saved = storage();
  const command = {action:'orders',parentId:'a'.repeat(36),body:{requestId:'old-request',quantity:1,side:'buy'}};
  const requests=queue(saved); requests.stage(command); requests.archive('session-renewed');
  assert.equal(requests.get(),null);assert.equal(queue(saved).get(),null);
  const archived=JSON.parse(saved.getItem('money-life-paper-pending-archive'));
  assert.equal(archived[0].request.body.requestId,'old-request');
  assert.equal(archived[0].reason,'session-renewed');
});

test('별도 보관에 실패하면 처리 여부를 모르는 요청을 잃지 않는다', () => {
  const saved=storage();const requests=queue(saved);
  requests.stage({action:'create',body:{requestId:'old-request'}});
  saved.setItem=()=>{throw new Error('Storage unavailable');};
  assert.throws(()=>requests.archive('session-renewed'));
  assert.equal(requests.get().body.requestId,'old-request');
});
