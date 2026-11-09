// Real browser/API integration. Author: sxhlxxn / Student ID: 202439688.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {spawn, spawnSync} = require('node:child_process');
const {mkdtemp, rm, writeFile} = require('node:fs/promises');
const {existsSync} = require('node:fs');
const {tmpdir} = require('node:os');
const path = require('node:path');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const port = Number(process.env.UI_TEST_PORT || 5187);
const apiPort = Number(process.env.UI_TEST_API_PORT || 3017);
const url = `http://127.0.0.1:${port}`;
const children = [];
let browser, temporary;
async function ready(address) {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(address)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Server unavailable: ${address}`);
}
before(async () => {
  temporary = await mkdtemp(path.join(tmpdir(), 'moneylife-ui-'));
  const venv = path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  const python = process.env.PYTHON_BIN || (existsSync(venv) ? venv : 'python3');
  const marketDirectory = path.join(temporary, 'market');
  const csv = path.join(temporary, 'test-daily.csv');
  await writeFile(csv, 'date,close,volume\n2024-01-31,10000,100\n2024-02-29,12000,100\n2024-03-29,9000,100\n');
  const imported = spawnSync(python, ['Server/scripts/import_market.py', '--csv', csv,
    '--series-id', 'ui-history-test-v1', '--symbol', '000001', '--label', '통합테스트 전용 가상 입력',
    '--start-month', '2024-01', '--end-month', '2024-03', '--source-url', 'https://example.org/test-data',
    '--provider', 'Browser Test', '--usage-scope', 'project', '--directory', marketDirectory], {cwd: root, encoding: 'utf8'});
  assert.equal(imported.status, 0, imported.stderr);
  const api = spawn(python, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(apiPort)], {
    cwd: path.join(root, 'Server'), env: {...process.env, DATABASE_URL: `sqlite+aiosqlite:///${path.join(temporary, 'test.db')}`, CLIENT_ORIGIN: url, MARKET_SERIES_DIR: marketDirectory, OPENAI_API_KEY: '', LLM_MODEL: '', LLM_PROVIDER: 'openai'}, stdio: 'pipe'});
  children.push(api);
  const client = spawn(process.execPath, ['scripts/dev-server.cjs'], {cwd: root,
    env: {...process.env, PORT: String(port), API_BASE_URL: `http://127.0.0.1:${apiPort}`}, stdio: 'pipe'});
  children.push(client);
  for (const child of children) child.on('error', error => console.error(error.message));
  await Promise.all([ready(url), ready(`http://127.0.0.1:${apiPort}/health`)]);
  browser = await chromium.launch({headless: true, ...(process.env.UI_BROWSER_PATH ? {executablePath: process.env.UI_BROWSER_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage']} : {})});
});
after(async () => {
  if (browser) await browser.close();
  await Promise.all(children.map(child => new Promise(resolve => {
    if (child.exitCode !== null) return resolve();
    child.once('exit', resolve); child.kill('SIGTERM');
  })));
  if (temporary) await rm(temporary, {recursive: true, force: true});
});
async function pageFor(t, viewport = {width: 1440, height: 1000}) {
  const context = await browser.newContext({viewport, baseURL: url});
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'No browser script errors'));
  await page.goto(url);
  await page.getByRole('button', {name: '닫기', exact: true}).click();
  await page.getByRole('button', {name: '모의투자 열기'}).click();
  await page.getByRole('button', {name: '예시 조건으로 체험', exact: true}).waitFor();
  return page;
}
async function demo(page) {
  const response = page.waitForResponse(r => r.url().endsWith('/api/paper-plans') && r.request().method() === 'POST');
  await page.getByRole('button', {name: '예시 조건으로 체험', exact: true}).click();
  assert.equal((await response).status(), 201);
  await page.waitForFunction(() => document.getElementById('paperstatus').textContent.includes('투자 연습을 시작'));
}
async function clickCommand(page, name, action) {
  const response = page.waitForResponse(r => r.url().endsWith('/' + action) && r.request().method() === 'POST');
  await page.getByRole('button', {name, exact: true}).click();
  if (action === 'orders') await page.getByRole('button', {name: '예약 확정', exact: true}).click();
  const result = await response; assert.equal(result.status(), 201);
  const body = await result.json();
  await page.waitForFunction(id => localStorage.getItem('money-life-paper-plan') === id && !localStorage.getItem('money-life-paper-pending'), body.plan.id);
  return body;
}
test('주문·월 진행·손익 비교·새로고침·저장 목록과 본편 보존', {timeout: 30000}, async t => {
  const page = await pageFor(t);
  const before = await page.evaluate(() => localStorage.getItem('money-life-v1'));
  await demo(page);
  await page.getByLabel('주문 수량 · 주').fill('50');
  let result = await clickCommand(page, '매수 예약', 'orders');
  assert.equal(result.run.result.invested.account.quantity, 0);
  assert.match(await page.locator('.paper-orders').innerText(), /매수 50주/);
  const previousId = result.plan.id;
  result = await clickCommand(page, '다음 달로 +1개월', 'advance');
  assert.equal(result.run.result.invested.account.quantity, 50);
  assert.equal(result.run.result.invested.executions[0].price, 10000);
  result = await clickCommand(page, '다음 달로 +1개월', 'advance');
  await page.getByLabel('주문 수량 · 주').fill('20');
  await clickCommand(page, '매도 예약', 'orders');
  await clickCommand(page, '다음 달로 +1개월', 'advance');
  await page.getByLabel('주문 수량 · 주').fill('30');
  await clickCommand(page, '매도 예약', 'orders');
  result = await clickCommand(page, '다음 달로 +1개월', 'advance');
  assert.equal(result.run.result.invested.summary.finalNetAssets, 1410000);
  assert.match(await page.locator('.paper-comparison').innerText(), /\+10,000원/);
  assert.equal(await page.getByRole('button', {name: '매수 예약', exact: true}).isDisabled(), true);
  assert.equal(await page.getByRole('button', {name: '다음 달로 +1개월', exact: true}).isDisabled(), true);
  assert.equal(await page.evaluate(() => localStorage.getItem('money-life-v1')), before);
  await page.reload(); await page.getByRole('button', {name: '닫기', exact: true}).click();
  await page.getByRole('button', {name: '모의투자 열기'}).click();
  await page.getByText('1,410,000원', {exact: true}).waitFor();
  await page.getByRole('button', {name: '저장한 투자 연습', exact: true}).click();
  const saved = page.locator('#papercontent .saved-plans');
  await saved.getByRole('button').first().waitFor();
  const old = saved.getByRole('button', {name: /나의 첫 투자 연습 · 0개월/}).first();
  await old.click();
  await page.waitForFunction(id => localStorage.getItem('money-life-paper-plan') !== id, result.plan.id);
  assert.match(await page.locator('.paper-date').innerText(), /0 \/ 4개월/);
  assert.equal(await page.evaluate(() => localStorage.getItem('money-life-paper-plan')), previousId);
});
test('응답 유실 후 새로고침·동일 요청 재확인으로 주문 중복 방지', {timeout: 30000}, async t => {
  const page = await pageFor(t);
  await demo(page);
  let accepted;
  await page.route('**/api/paper-plans/*/orders', async route => {
    const response = await route.fetch(); accepted = await response.json();
    await route.abort('failed');
  });
  await page.getByLabel('주문 수량 · 주').fill('10');
  await page.getByRole('button', {name: '매수 예약', exact: true}).click();
  await page.getByRole('button', {name: '예약 확정', exact: true}).click();
  await page.getByRole('button', {name: '같은 요청 다시 확인', exact: true}).waitFor();
  await page.waitForFunction(() => !document.querySelector('[data-plan-action="paper-open"]').disabled);
  assert.ok(accepted);
  assert.equal(await page.getByRole('button', {name: '다음 달로 +1개월', exact: true}).isDisabled(), true);
  const pendingId = await page.evaluate(() => JSON.parse(localStorage.getItem('money-life-paper-pending')).body.requestId);
  await page.unroute('**/api/paper-plans/*/orders');
  await page.reload(); await page.getByRole('button', {name: '닫기', exact: true}).click();
  await page.getByRole('button', {name: '모의투자 열기'}).click();
  await page.getByRole('button', {name: '같은 요청 다시 확인', exact: true}).click();
  await page.waitForFunction(id => localStorage.getItem('money-life-paper-plan') === id && !localStorage.getItem('money-life-paper-pending'), accepted.plan.id);
  assert.equal(accepted.plan.orders[0].id, pendingId);
  assert.equal(await page.locator('.paper-orders p').count(), 1);
  const result = await clickCommand(page, '다음 달로 +1개월', 'advance');
  assert.equal(result.run.result.invested.account.quantity, 10);
  assert.equal(result.run.result.invested.executions.length, 1);
});
test('모바일 입력·거부 안내·기간 종료 및 가상 데이터 표시', {timeout: 30000}, async t => {
  const page = await pageFor(t, {width: 390, height: 844});
  await demo(page);
  await page.getByLabel('주문 수량 · 주').fill('1.5');
  await page.getByRole('button', {name: '매수 예약', exact: true}).click();
  assert.match(await page.locator('#paperstatus').innerText(), /정수/);
  await page.getByLabel('주문 수량 · 주').fill('1000');
  await clickCommand(page, '매수 예약', 'orders');
  await clickCommand(page, '다음 달로 +1개월', 'advance');
  await page.locator('.paper-history summary').click();
  assert.match(await page.locator('.paper-history').innerText(), /거부.*현금 부족/s);
  assert.match(await page.locator('.paper-lab-head').innerText(), /실제 주문 미연결/s);
  const dimensions = await page.evaluate(() => ({width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth}));
  assert.ok(dimensions.scroll <= dimensions.width, 'No horizontal page overflow');
  if (process.env.UI_SCREENSHOT_DIR) await page.evaluate(() => document.fonts.ready);
  if (process.env.UI_SCREENSHOT_DIR) await page.locator('#paperlab').screenshot({path: path.join(process.env.UI_SCREENSHOT_DIR, 'paper-mobile.png')});
});
test('개인 조건 사본·저장된 매도 예약 초과·다른 화면과 버튼 잠금', {timeout: 30000}, async t => {
  const page = await pageFor(t);
  await page.getByRole('button', {name: '현재 여정의 사본으로 시작', exact: true}).click();
  await page.getByLabel('주문 수량 · 주').waitFor();
  assert.match(await page.locator('.paper-metrics').innerText(), /3,000,000원/);
  await page.getByLabel('주문 수량 · 주').fill('10');
  await clickCommand(page, '매수 예약', 'orders');
  await clickCommand(page, '다음 달로 +1개월', 'advance');
  await page.getByLabel('주문 수량 · 주').fill('6');
  await clickCommand(page, '매도 예약', 'orders');
  await page.getByLabel('주문 수량 · 주').fill('5');
  await page.getByRole('button', {name: '매도 예약', exact: true}).click();
  await page.waitForFunction(() => document.getElementById('paperstatus').textContent.includes('이미 예약한'));
  await page.getByRole('button', {name: '돌아가기', exact: true}).click();
  assert.equal(await page.evaluate(() => localStorage.getItem('money-life-paper-pending')), null);
  assert.equal(await page.getByRole('button', {name: '다음 달로 +1개월', exact: true}).isDisabled(), false);
  if (process.env.UI_SCREENSHOT_DIR) await page.evaluate(() => document.fonts.ready);
  if (process.env.UI_SCREENSHOT_DIR) await page.locator('#paperlab').screenshot({path: path.join(process.env.UI_SCREENSHOT_DIR, 'paper-desktop.png')});
});
test('지원 기간이 지난 본편은 유지하고 예시 연습을 제공', {timeout: 30000}, async t => {
  const page = await pageFor(t);
  await page.evaluate(() => { month = 13; render(); });
  const before = await page.evaluate(() => localStorage.getItem('money-life-v1'));
  await page.getByRole('button', {name: '새 투자 연습', exact: true}).click();
  assert.equal(await page.getByRole('button', {name: '현재 여정의 사본으로 시작', exact: true}).isDisabled(), true);
  assert.match(await page.locator('.paper-setup').innerText(), /지원 기간을 지났어요/);
  await demo(page);
  assert.equal(await page.evaluate(() => localStorage.getItem('money-life-v1')), before);
  assert.match(await page.locator('#monthlabel').innerText(), /13 \/ 120/);
});
test('모의투자 이후 기존 여정 저장·계산 결과·AI 오류 안내 유지', {timeout: 30000}, async t => {
  const page = await pageFor(t);
  await demo(page);
  await page.getByRole('button', {name: '서버 계산·저장', exact: true}).click();
  await page.waitForFunction(() => document.getElementById('serverstatus').textContent.includes('서버 저장 완료'));
  await page.getByRole('button', {name: '계산 결과', exact: true}).click();
  await page.locator('#runsummary strong').first().waitFor();
  assert.equal(await page.locator('#runmonths tr').count(), 121);
  await page.getByRole('button', {name: '닫기', exact: true}).click();
  await page.route('**/api/ai/parse-change', route => route.fulfill({status: 503, contentType: 'application/json', body: JSON.stringify({detail: 'LLM_NOT_CONFIGURED'})}));
  await page.getByLabel('조건 변경 요청').fill('저축을 100만 원으로 변경');
  await page.getByRole('button', {name: '질문 보내기', exact: true}).click();
  await page.waitForFunction(() => document.getElementById('serverstatus').textContent.includes('LLM API 키'));
  assert.equal(await page.getByRole('button', {name: '다음 달로 +1개월', exact: true}).isDisabled(), false);
});
test('등록 가격 선택·과거 월 표시·출처와 이전 시점 복원', {timeout: 30000}, async t => {
  const page = await pageFor(t);
  await page.getByLabel('사용할 가격 데이터').selectOption('ui-history-test-v1');
  assert.match(await page.locator('.paper-setup').innerText(), /2024-01~2024-03/);
  await demo(page);
  assert.match(await page.locator('.paper-date').innerText(), /2024년 1월/);
  assert.match(await page.locator('.paper-provenance').innerText(), /Browser Test/);
  assert.equal(await page.getByRole('link', {name: '가격 출처 확인'}).getAttribute('href'), 'https://example.org/test-data');
  await page.getByLabel('주문 수량 · 주').fill('2');
  await clickCommand(page, '매수 예약', 'orders');
  assert.match(await page.locator('.paper-orders').innerText(), /2024년 2월/);
  const result = await clickCommand(page, '다음 달로 +1개월', 'advance');
  assert.equal(result.run.result.invested.executions[0].price, 12000);
  await page.locator('.paper-history summary').click();
  assert.match(await page.locator('.paper-history').innerText(), /2024년 2월/);
  assert.match(await page.locator('.paper-date').innerText(), /1 \/ 2개월/);
  await clickCommand(page, '다음 달로 +1개월', 'advance');
  assert.equal(await page.getByRole('button', {name: '다음 달로 +1개월', exact: true}).isDisabled(), true);
  await page.reload(); await page.getByRole('button', {name: '닫기', exact: true}).click();
  await page.getByRole('button', {name: '모의투자 열기'}).click();
  await page.locator('.paper-provenance').waitFor();
  assert.match(await page.locator('.paper-date').innerText(), /2024년 3월/);
});
test('가격 목록 오류에도 저장된 원본으로 복원·월 진행', {timeout: 30000}, async t => {
  const page = await pageFor(t);
  await demo(page);
  await page.reload(); await page.getByRole('button', {name: '닫기', exact: true}).click();
  await page.route('**/api/market/series', route => route.fulfill({status: 503, contentType: 'application/json', body: JSON.stringify({detail: 'MARKET_CATALOG_INVALID'})}));
  await page.getByRole('button', {name: '모의투자 열기'}).click();
  await page.waitForFunction(() => document.getElementById('paperstatus').textContent.includes('저장된 가격으로 진행'));
  const result = await clickCommand(page, '다음 달로 +1개월', 'advance');
  assert.equal(result.plan.month, 1);
});
test('주문 확인·취소·Escape·새로고침은 예약을 만들지 않는다', {timeout: 30000}, async t => {
  const page = await pageFor(t);
  await demo(page);
  const originalId = await page.evaluate(() => localStorage.getItem('money-life-paper-plan'));
  let orders = 0;
  page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/orders')) orders++; });
  await page.getByLabel('주문 수량 · 주').fill('50');
  await page.getByRole('button', {name: '매수 예약', exact: true}).click();
  await page.getByRole('button', {name: '예약 확정', exact: true}).waitFor();
  assert.match(await page.locator('#paperreview').innerText(), /475,000원/);
  assert.match(await page.locator('#paperreview').innerText(), /575,000원/);
  assert.match(await page.locator('#paperreview').innerText(), /다음 달 실제 가격으로 다시 판단/);
  assert.equal(await page.evaluate(() => localStorage.getItem('money-life-paper-pending')), null);
  await page.getByRole('button', {name: '수량 다시 수정', exact: true}).click();
  assert.equal(orders, 0);
  assert.equal(await page.getByLabel('주문 수량 · 주').inputValue(), '50');
  await page.getByRole('button', {name: '매수 예약', exact: true}).click();
  await page.getByRole('button', {name: '예약 확정', exact: true}).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(orders, 0);
  await page.getByRole('button', {name: '매수 예약', exact: true}).click();
  await page.getByRole('button', {name: '예약 확정', exact: true}).waitFor();
  await page.reload();
  assert.equal(orders, 0);
  assert.equal(await page.evaluate(() => localStorage.getItem('money-life-paper-plan')), originalId);
  assert.equal(await page.evaluate(() => localStorage.getItem('money-life-paper-pending')), null);
});
test('모바일 확인 화면에서 수량을 고정하고 확정 후에만 예약한다', {timeout: 30000}, async t => {
  const page = await pageFor(t, {width: 390, height: 844});
  await demo(page);
  await page.getByLabel('주문 수량 · 주').fill('1000');
  await page.getByRole('button', {name: '매수 예약', exact: true}).click();
  await page.getByRole('button', {name: '예약 확정', exact: true}).waitFor();
  assert.match(await page.locator('#paperreview').innerText(), /현금이 부족해/);
  // A changed background input must not silently change the reviewed order.
  await page.evaluate(() => { document.getElementById('paperquantity').value = '1'; });
  const dimensions = await page.evaluate(() => ({width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth}));
  assert.ok(dimensions.scroll <= dimensions.width);
  if (process.env.UI_SCREENSHOT_DIR) {
    await page.evaluate(() => document.fonts.ready);
    await page.locator('#modal').screenshot({path: path.join(process.env.UI_SCREENSHOT_DIR, 'order-review-mobile.png')});
  }
  const response = page.waitForResponse(r => r.url().endsWith('/orders') && r.request().method() === 'POST');
  await page.getByRole('button', {name: '예약 확정', exact: true}).click();
  const saved = await (await response).json();
  assert.equal(saved.plan.orders[0].quantity, 1000);
});
test('확인 요청 실패나 확인 화면을 닫은 뒤 늦은 응답은 주문을 만들지 않는다', {timeout: 30000}, async t => {
  const page = await pageFor(t);
  await demo(page);
  let orders = 0;
  page.on('request', request => { if (request.url().endsWith('/orders') && request.method() === 'POST') orders++; });
  await page.route('**/order-preview', route => route.fulfill({status: 503, contentType: 'application/json', body: JSON.stringify({detail: 'ENGINE_UNAVAILABLE'})}));
  await page.getByRole('button', {name: '매수 예약', exact: true}).click();
  await page.getByRole('button', {name: '돌아가기', exact: true}).click();
  assert.equal(orders, 0);
  await page.unroute('**/order-preview');
  let release;
  const hold = new Promise(resolve => { release = resolve; });
  await page.route('**/order-preview', async route => { const response = await route.fetch(); await hold; await route.fulfill({response}); });
  await page.getByRole('button', {name: '매수 예약', exact: true}).click();
  await page.getByRole('button', {name: '닫기', exact: true}).click();
  release();
  await page.waitForFunction(() => !document.querySelector('[data-plan-action="paper-open"]').disabled);
  assert.equal(await page.locator('#overlay').evaluate(el => el.classList.contains('hidden')), true);
  assert.equal(orders, 0);
  assert.equal(await page.evaluate(() => localStorage.getItem('money-life-paper-pending')), null);
});
test('기본 투자 해설은 외부 AI 요청 없이 현재 실행에 연결된다', {timeout: 30000}, async t => {
  const page = await pageFor(t);
  await demo(page);
  let aiRequests = 0;
  page.on('request', r => { if (r.url().endsWith('/explanation') && r.method() === 'POST') aiRequests++; });
  await page.getByRole('button', {name: '기본 해설 보기', exact: true}).click();
  const section = page.getByRole('region', {name: '투자 결과 해설'});
  await section.locator('article').first().waitFor();
  assert.match(await section.innerText(), /기본 계산 지표 해설/);
  assert.match(await section.innerText(), /진행한 0개월/);
  assert.doesNotMatch(await section.locator('.paper-explanation-facts').innerText(), /120개월/);
  assert.equal(aiRequests, 0);
  await clickCommand(page, '다음 달로 +1개월', 'advance');
  assert.equal(await section.locator('article').count(), 0, 'An old explanation must not be shown for a new Run');
  await page.getByRole('button', {name: '기본 해설 보기', exact: true}).click();
  await page.waitForFunction(() => document.querySelector('.paper-explanation-facts').textContent.includes('진행한 1개월'));
  assert.equal(aiRequests, 0);
});
test('AI 버튼의 명시적 호출·미설정 대체·선택형 해설 출처를 구분한다', {timeout: 30000}, async t => {
  const page = await pageFor(t);
  await demo(page);
  await page.getByRole('button', {name: 'AI로 핵심 지표 정리', exact: true}).click();
  const section = page.getByRole('region', {name: '투자 결과 해설'});
  await page.waitForFunction(() => document.querySelector('.paper-explanation').textContent.includes('AI 연결 설정 전'));
  assert.ok(await section.locator('article').count() >= 4);
  const planId = await page.evaluate(() => localStorage.getItem('money-life-paper-plan'));
  const planResponse = await page.request.get('/api/paper-plans/' + planId);
  const plan = await planResponse.json();
  const baseResponse = await page.request.get('/api/paper-runs/' + plan.runId + '/explanation');
  const base = await baseResponse.json();
  await page.route('**/explanation', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    assert.deepEqual(route.request().postDataJSON(), {useAI: true});
    await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({...base, source: 'llm-ranked', cached: true})});
  });
  await page.getByRole('button', {name: 'AI로 핵심 지표 정리', exact: true}).click();
  await page.waitForFunction(() => document.querySelector('.paper-explanation').textContent.includes('AI가 선택·정렬한'));
  assert.match(await section.innerText(), /저장된 선택을 다시 불러왔어요/);
  assert.match(await section.innerText(), /외부 AI에 전송/);
});
test('모바일 해설·실패 안내가 기존 결과와 주문을 바꾸지 않는다', {timeout: 30000}, async t => {
  const page = await pageFor(t, {width: 390, height: 844});
  await demo(page);
  const planId = await page.evaluate(() => localStorage.getItem('money-life-paper-plan'));
  await page.getByRole('button', {name: '기본 해설 보기', exact: true}).click();
  const section = page.getByRole('region', {name: '투자 결과 해설'});
  await section.locator('article').first().waitFor();
  const before = await section.locator('.paper-explanation-facts').innerText();
  const dimensions = await page.evaluate(() => ({width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth}));
  assert.ok(dimensions.scroll <= dimensions.width);
  if (process.env.UI_SCREENSHOT_DIR) {
    await page.evaluate(() => document.fonts.ready);
    await section.screenshot({path: path.join(process.env.UI_SCREENSHOT_DIR, 'paper-explanation-mobile.png')});
  }
  await page.route('**/explanation', route => route.fulfill({status: 503, contentType: 'application/json', body: JSON.stringify({detail: 'DATABASE_UNAVAILABLE'})}));
  await page.getByRole('button', {name: '기본 해설 보기', exact: true}).click();
  await page.waitForFunction(() => document.querySelector('.paper-explanation').textContent.includes('저장된 투자 결과와 주문은 유지'));
  assert.equal(await section.locator('.paper-explanation-facts').innerText(), before);
  assert.equal(await page.evaluate(() => localStorage.getItem('money-life-paper-plan')), planId);
  assert.equal(await page.evaluate(() => localStorage.getItem('money-life-paper-pending')), null);
});
test('대기 매수 취소 확인·주문 유지·취소 사본 저장과 재접속', {timeout: 30000}, async t => {
  const page = await pageFor(t);
  await demo(page);
  await page.getByLabel('주문 수량 · 주').fill('10');
  const pending = await clickCommand(page, '매수 예약', 'orders');
  await page.getByRole('button', {name: '주문 취소', exact: true}).click();
  await page.getByRole('button', {name: '주문 유지', exact: true}).click();
  assert.equal(await page.evaluate(() => localStorage.getItem('money-life-paper-plan')), pending.plan.id);
  assert.equal(await page.locator('.paper-pending-row').count(), 1);
  await page.getByRole('button', {name: '주문 취소', exact: true}).click();
  const response = page.waitForResponse(r => r.url().endsWith('/cancel') && r.request().method() === 'POST');
  await page.getByRole('button', {name: '취소 확정', exact: true}).click();
  const cancelled = await (await response).json();
  await page.waitForFunction(id => localStorage.getItem('money-life-paper-plan') === id && !localStorage.getItem('money-life-paper-pending'), cancelled.plan.id);
  assert.equal(cancelled.plan.action, 'cancel');
  assert.equal(await page.locator('.paper-pending-row').count(), 0);
  assert.match(await page.locator('.paper-orders').innerText(), /주문 취소를 반영한 사본/);
  const original = await page.request.get('/api/paper-plans/' + pending.plan.id);
  assert.equal((await original.json()).orders.length, 1);
  await page.reload(); await page.getByRole('button', {name: '닫기', exact: true}).click();
  await page.getByRole('button', {name: '모의투자 열기'}).click();
  await page.getByText('주문 취소를 반영한 사본이에요.', {exact: false}).waitFor();
  const advanced = await clickCommand(page, '다음 달로 +1개월', 'advance');
  assert.equal(advanced.run.result.invested.account.quantity, 0);
  assert.equal(advanced.run.result.invested.executions.length, 0);
  await page.getByRole('button', {name: '저장한 투자 연습', exact: true}).click();
  await page.locator('.saved-plans').getByRole('button', {name: /주문 취소/}).waitFor();
});
test('취소 응답 유실 뒤 동일 요청 복원·중복 취소 방지', {timeout: 30000}, async t => {
  const page = await pageFor(t);
  await demo(page);
  const pending = await clickCommand(page, '매수 예약', 'orders');
  let accepted;
  await page.route('**/orders/*/cancel', async route => {
    const response = await route.fetch(); accepted = await response.json(); await route.abort('failed');
  });
  await page.getByRole('button', {name: '주문 취소', exact: true}).click();
  await page.getByRole('button', {name: '취소 확정', exact: true}).click();
  await page.getByRole('button', {name: '같은 요청 다시 확인', exact: true}).waitFor();
  await page.waitForFunction(() => !document.querySelector('[data-plan-action="paper-open"]').disabled);
  assert.ok(accepted);
  const request = await page.evaluate(() => JSON.parse(localStorage.getItem('money-life-paper-pending')));
  assert.equal(request.action, 'cancel'); assert.equal(request.orderId, pending.plan.orders[0].id);
  assert.equal(await page.getByRole('button', {name: '다음 달로 +1개월', exact: true}).isDisabled(), true);
  await page.unroute('**/orders/*/cancel');
  await page.reload(); await page.getByRole('button', {name: '닫기', exact: true}).click();
  await page.getByRole('button', {name: '모의투자 열기'}).click();
  await page.getByRole('button', {name: '같은 요청 다시 확인', exact: true}).click();
  await page.waitForFunction(id => localStorage.getItem('money-life-paper-plan') === id && !localStorage.getItem('money-life-paper-pending'), accepted.plan.id);
  assert.equal(await page.locator('.paper-pending-row').count(), 0);
  const plans = await (await page.request.get('/api/paper-plans')).json();
  assert.equal(plans.length, 3);
});
test('모바일 매도 예약 취소가 보유 수량·체결 기록을 유지한다', {timeout: 30000}, async t => {
  const page = await pageFor(t, {width: 390, height: 844});
  await demo(page);
  await page.getByLabel('주문 수량 · 주').fill('10');
  await clickCommand(page, '매수 예약', 'orders');
  const bought = await clickCommand(page, '다음 달로 +1개월', 'advance');
  await page.getByLabel('주문 수량 · 주').fill('6');
  await clickCommand(page, '매도 예약', 'orders');
  await page.getByRole('button', {name: '주문 취소', exact: true}).click();
  if (process.env.UI_SCREENSHOT_DIR) {
    await page.evaluate(() => document.fonts.ready);
    await page.locator('#modal').screenshot({path: path.join(process.env.UI_SCREENSHOT_DIR, 'order-cancel-mobile.png')});
  }
  const response = page.waitForResponse(r => r.url().endsWith('/cancel') && r.request().method() === 'POST');
  await page.getByRole('button', {name: '취소 확정', exact: true}).click();
  const cancelled = await (await response).json();
  await page.waitForFunction(id => localStorage.getItem('money-life-paper-plan') === id, cancelled.plan.id);
  assert.equal(cancelled.run.result.invested.account.quantity, 10);
  assert.equal(cancelled.run.result.invested.account.cash, bought.run.result.invested.account.cash);
  assert.deepEqual(cancelled.run.result.invested.executions, bought.run.result.invested.executions);
  const dimensions = await page.evaluate(() => ({width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth}));
  assert.ok(dimensions.scroll <= dimensions.width);
  await page.getByLabel('주문 수량 · 주').fill('10');
  await page.getByRole('button', {name: '매도 예약', exact: true}).click();
  await page.getByRole('button', {name: '예약 확정', exact: true}).waitFor();
  assert.match(await page.locator('#paperreview').innerText(), /현재 매도 가능 10주/);
});
test('생활 조건 확인·취소·새 사본 적용은 현재 자산과 주식을 유지한다', {timeout: 30000}, async t => {
  const page = await pageFor(t);
  await demo(page);
  await page.getByLabel('주문 수량 · 주').fill('50');
  await clickCommand(page, '매수 예약', 'orders');
  const previous = await clickCommand(page, '다음 달로 +1개월', 'advance');
  await page.getByRole('button', {name: '생활 조건 변경', exact: true}).click();
  await page.getByLabel('월 소득 · 원', {exact: true}).waitFor();
  assert.equal(await page.getByLabel('월 소득 · 원', {exact: true}).inputValue(), '200000');
  await page.getByRole('button', {name: '변경 내용 확인', exact: true}).click();
  assert.match(await page.locator('#papercondition-error').innerText(), /한 항목 이상/);
  await page.getByLabel('월 소득 · 원', {exact: true}).fill('300000');
  await page.getByRole('button', {name: '변경 없이 닫기', exact: true}).click();
  assert.equal(await page.evaluate(() => localStorage.getItem('money-life-paper-plan')), previous.plan.id);
  await page.getByRole('button', {name: '생활 조건 변경', exact: true}).click();
  await page.getByLabel('월 소득 · 원', {exact: true}).fill('300000');
  await page.getByLabel('월 생활비 · 원', {exact: true}).fill('80000');
  await page.getByLabel('월 저축 이체액 · 원', {exact: true}).fill('0');
  await page.getByRole('button', {name: '변경 내용 확인', exact: true}).click();
  assert.match(await page.locator('#paperconditions').innerText(), /200,000원 → 300,000원/);
  assert.equal(await page.evaluate(() => localStorage.getItem('money-life-paper-pending')), null);
  await page.getByRole('button', {name: '다시 수정', exact: true}).click();
  assert.equal(await page.getByLabel('월 저축 이체액 · 원', {exact: true}).inputValue(), '0');
  await page.getByRole('button', {name: '변경 내용 확인', exact: true}).click();
  const response = page.waitForResponse(r => r.url().endsWith('/conditions') && r.request().method() === 'POST');
  await page.getByRole('button', {name: '다음 달부터 적용', exact: true}).click();
  const updated = await (await response).json();
  await page.waitForFunction(id => localStorage.getItem('money-life-paper-plan') === id, updated.plan.id);
  assert.deepEqual(updated.run.result, previous.run.result);
  const next = await clickCommand(page, '다음 달로 +1개월', 'advance');
  assert.equal(next.run.result.invested.summary.finalNetAssets, 1420000);
  assert.equal(next.run.result.invested.account.quantity, 50);
  const old = await (await page.request.get('/api/paper-plans/' + previous.plan.id)).json();
  assert.deepEqual(old, previous.plan);
});
test('조건 변경 응답 유실 뒤 동일 요청으로 복원한다', {timeout: 30000}, async t => {
  const page = await pageFor(t);
  await demo(page);
  let saved;
  await page.route('**/conditions', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    const response = await route.fetch(); saved = await response.json(); await route.abort('failed');
  });
  await page.getByRole('button', {name: '생활 조건 변경', exact: true}).click();
  await page.getByLabel('월 생활비 · 원', {exact: true}).fill('80000');
  await page.getByRole('button', {name: '변경 내용 확인', exact: true}).click();
  await page.getByRole('button', {name: '다음 달부터 적용', exact: true}).click();
  await page.getByRole('button', {name: '같은 요청 다시 확인', exact: true}).waitFor();
  await page.waitForFunction(() => !document.querySelector('[data-plan-action="paper-open"]').disabled);
  assert.ok(saved);
  const pending = await page.evaluate(() => JSON.parse(localStorage.getItem('money-life-paper-pending')));
  assert.equal(pending.action, 'conditions'); assert.deepEqual(pending.body.values, {expense: 80000});
  assert.equal(await page.getByRole('button', {name: '다음 달로 +1개월', exact: true}).isDisabled(), true);
  await page.unroute('**/conditions');
  await page.reload(); await page.getByRole('button', {name: '닫기', exact: true}).click();
  await page.getByRole('button', {name: '모의투자 열기'}).click();
  await page.getByRole('button', {name: '같은 요청 다시 확인', exact: true}).click();
  await page.waitForFunction(id => localStorage.getItem('money-life-paper-plan') === id && !localStorage.getItem('money-life-paper-pending'), saved.plan.id);
  assert.equal((await (await page.request.get('/api/paper-plans')).json()).length, 2);
  const advanced = await clickCommand(page, '다음 달로 +1개월', 'advance');
  assert.equal(advanced.run.result.invested.summary.finalNetAssets, 1120000);
});
test('모바일 조건 입력·검증과 마지막 달 제한', {timeout: 30000}, async t => {
  const page = await pageFor(t, {width: 390, height: 844});
  await demo(page);
  await page.getByRole('button', {name: '생활 조건 변경', exact: true}).click();
  await page.getByLabel('월 소득 · 원', {exact: true}).fill('-1');
  await page.getByRole('button', {name: '변경 내용 확인', exact: true}).click();
  assert.match(await page.locator('#papercondition-error').innerText(), /정수 원/);
  await page.getByLabel('월 소득 · 원', {exact: true}).fill('300000');
  await page.getByRole('button', {name: '변경 내용 확인', exact: true}).click();
  const dimensions = await page.evaluate(() => ({width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth}));
  assert.ok(dimensions.scroll <= dimensions.width);
  if (process.env.UI_SCREENSHOT_DIR) {
    await page.evaluate(() => document.fonts.ready);
    await page.locator('#modal').screenshot({path: path.join(process.env.UI_SCREENSHOT_DIR, 'paper-conditions-mobile.png')});
  }
  await page.keyboard.press('Escape');
  for (let i = 0; i < 4; i++) await clickCommand(page, '다음 달로 +1개월', 'advance');
  assert.equal(await page.getByRole('button', {name: '생활 조건 변경', exact: true}).isDisabled(), true);
});
test('저장 투자 사본 세 개 비교와 선택 제한·현재 사본 보존', {timeout: 30000}, async t => {
  const page = await pageFor(t, {width: 390, height: 844});
  await demo(page);
  await page.getByLabel('주문 수량 · 주').fill('50');
  await clickCommand(page, '매수 예약', 'orders');
  const parent = await clickCommand(page, '다음 달로 +1개월', 'advance');
  const reference = await clickCommand(page, '다음 달로 +1개월', 'advance');
  async function fork(values) {
    const changedResponse = await page.request.post('/api/paper-plans/' + parent.plan.id + '/conditions', {data: {requestId: crypto.randomUUID(), values}});
    assert.equal(changedResponse.status(), 201);
    const changed = await changedResponse.json();
    const advanced = await page.request.post('/api/paper-plans/' + changed.plan.id + '/advance', {data: {requestId: crypto.randomUUID()}});
    assert.equal(advanced.status(), 201); return advanced.json();
  }
  const b = await fork({income: 300000});
  const c = await fork({monthlySaving: 0});
  const d = await fork({expense: 80000});
  await page.getByRole('button', {name: '투자 사본 비교', exact: true}).click();
  const box = page.locator('#papercompare');
  await box.locator(`input[value="${b.plan.id}"]`).check();
  await box.locator(`input[value="${c.plan.id}"]`).check();
  await box.locator(`input[value="${d.plan.id}"]`).click();
  assert.equal(await box.locator(`input[value="${d.plan.id}"]`).isChecked(), false);
  assert.match(await page.locator('#papercompare-status').innerText(), /최대 세 사본/);
  const response = page.waitForResponse(r => r.url().endsWith('/paper-comparisons') && r.request().method() === 'POST');
  await page.getByRole('button', {name: '선택한 사본 비교', exact: true}).click();
  const result = await (await response).json();
  await page.getByRole('heading', {name: '2개월까지의 선택을 비교했어요', exact: true}).waitFor();
  assert.equal(result.paths.length, 3);
  assert.deepEqual(result.paths.map(p => p.summary.finalNetAssets), [1300000, 1400000, 1300000]);
  assert.equal(await page.evaluate(() => localStorage.getItem('money-life-paper-plan')), reference.plan.id);
  assert.match(await box.innerText(), /A 대비 순자산 \+100,000원/);
  assert.equal(await box.getByRole('img', {name: '선택한 3개 사본의 2개월까지 순자산 비교'}).count(), 1);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  if (process.env.UI_SCREENSHOT_DIR) {
    await page.evaluate(() => document.fonts.ready);
    await page.locator('#modal').screenshot({path: path.join(process.env.UI_SCREENSHOT_DIR, 'paper-comparison-mobile.png')});
  }
});
test('진행 월이 다른 비교는 공통 구간의 목표만 표시한다', {timeout: 30000}, async t => {
  const page = await pageFor(t);
  await demo(page);
  const rootId = await page.evaluate(() => localStorage.getItem('money-life-paper-plan'));
  const orderResponse = await page.request.post('/api/paper-plans/' + rootId + '/orders', {data: {requestId: crypto.randomUUID(), side: 'buy', quantity: 50}});
  const pending = await orderResponse.json();
  const laterResponse = await page.request.post('/api/paper-plans/' + pending.plan.id + '/advance', {data: {requestId: crypto.randomUUID(), months: 3}});
  const later = await laterResponse.json();
  assert.equal(later.run.result.invested.summary.goalMonth, 2);
  await page.getByRole('button', {name: '투자 사본 비교', exact: true}).click();
  await page.locator(`#papercompare input[value="${later.plan.id}"]`).check();
  await page.getByRole('button', {name: '선택한 사본 비교', exact: true}).click();
  await page.getByRole('heading', {name: '0개월까지의 선택을 비교했어요', exact: true}).waitFor();
  assert.match(await page.locator('.paper-branch-cards').innerText(), /공통 구간 내 아직 미달성/);
  assert.doesNotMatch(await page.locator('.paper-branch-cards').innerText(), /2개월차/);
  assert.equal(await page.evaluate(() => localStorage.getItem('money-life-paper-plan')), rootId);
});
