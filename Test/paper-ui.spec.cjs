// Real browser/API integration. Author: sxhlxxn.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {spawn, spawnSync} = require('node:child_process');
const {mkdtemp, rm, writeFile} = require('node:fs/promises');
const {existsSync} = require('node:fs');
const {tmpdir} = require('node:os');
const path = require('node:path');
const {chromium} = require('playwright');
const newsRules = require('../Engine/src/news-scenario.js');
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
async function revealJourneyTools(page) {
  for (const selector of ['.journey-drawer', '#play-details']) {
    const details = page.locator(selector);
    if (await details.isVisible() && await details.getAttribute('open') === null)
      await details.locator('summary').first().click();
  }
}
async function pageFor(t, viewport = {width: 1440, height: 1000}) {
  const context = await browser.newContext({viewport, baseURL: url});
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'No browser script errors'));
  await page.goto(url);
  await page.getByRole('button', {name: '닫기', exact: true}).click();
  await revealJourneyTools(page);
  await page.getByRole('button', {name: '모의투자 열기 ↗', exact: true}).click();
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
  await revealJourneyTools(page);
  await page.getByRole('button', {name: '모의투자 열기 ↗', exact: true}).click();
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
  await revealJourneyTools(page);
  await page.getByRole('button', {name: '모의투자 열기 ↗', exact: true}).click();
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
  await page.evaluate(() => { JourneyStore.set("month",13); render(); });
  const before = await page.evaluate(() => localStorage.getItem('money-life-v1'));
  await page.getByRole('button', {name: '새 투자 연습', exact: true}).click();
  assert.equal(await page.getByRole('button', {name: '현재 여정의 사본으로 시작', exact: true}).isDisabled(), true);
  assert.match(await page.locator('.paper-setup').innerText(), /지원 기간을 지났어요/);
  await demo(page);
  assert.equal(await page.evaluate(() => localStorage.getItem('money-life-v1')), before);
  assert.match(await page.locator('#ml-game-month-label').innerText(), /13 \/ 120/);
});
test('모의투자 이후 기존 여정 저장·계산 결과·AI 오류 안내 유지', {timeout: 30000}, async t => {
  const page = await pageFor(t);
  await demo(page);
  await page.getByRole('button', {name: '서버 계산·저장', exact: true}).click();
  await page.waitForFunction(() => document.getElementById('serverstatus').textContent.includes('계획과 계산 결과를 저장'));
  await page.getByRole('button', {name: '계산 결과', exact: true}).click();
  await page.locator('#runsummary strong').first().waitFor();
  assert.equal(await page.locator('#runmonths tr').count(), 121);
  await page.getByRole('button', {name: '닫기', exact: true}).click();
  await revealJourneyTools(page);
  await page.route('**/api/ai/parse-change', route => route.fulfill({status: 503, contentType: 'application/json', body: JSON.stringify({detail: 'LLM_NOT_CONFIGURED'})}));
  await page.locator('#ml-main-nav [data-page=dashboard]').click();
  await page.getByLabel('조건 변경 요청').fill('저축을 100만 원으로 변경');
  await page.getByRole('button', {name: '변경안 확인', exact: true}).click();
  await page.waitForFunction(() => document.getElementById('serverstatus').textContent.includes('LLM API 키'));
  await page.getByRole('button', {name: '은행에서 모의투자 열기', exact: true}).click();
  await page.waitForFunction(() => !document.querySelector('[data-plan-action=paper-open]').disabled);
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
  await revealJourneyTools(page);
  await page.getByRole('button', {name: '모의투자 열기 ↗', exact: true}).click();
  await page.locator('.paper-provenance').waitFor();
  assert.match(await page.locator('.paper-date').innerText(), /2024년 3월/);
});
test('가격 목록 오류에도 저장된 원본으로 복원·월 진행', {timeout: 30000}, async t => {
  const page = await pageFor(t);
  await demo(page);
  await page.reload(); await page.getByRole('button', {name: '닫기', exact: true}).click();
  await revealJourneyTools(page);
  await page.route('**/api/market/series', route => route.fulfill({status: 503, contentType: 'application/json', body: JSON.stringify({detail: 'MARKET_CATALOG_INVALID'})}));
  await page.getByRole('button', {name: '모의투자 열기 ↗', exact: true}).click();
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
  await revealJourneyTools(page);
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
  await revealJourneyTools(page);
  await page.getByRole('button', {name: '모의투자 열기 ↗', exact: true}).click();
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
  await revealJourneyTools(page);
  await page.getByRole('button', {name: '모의투자 열기 ↗', exact: true}).click();
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
  await page.locator('#paperconditions').getByLabel('월 소득 · 원', {exact: true}).waitFor();
  assert.equal(await page.locator('#paperconditions').getByLabel('월 소득 · 원', {exact: true}).inputValue(), '200000');
  await page.getByRole('button', {name: '변경 내용 확인', exact: true}).click();
  assert.match(await page.locator('#papercondition-error').innerText(), /한 항목 이상/);
  await page.locator('#paperconditions').getByLabel('월 소득 · 원', {exact: true}).fill('300000');
  await page.getByRole('button', {name: '변경 없이 닫기', exact: true}).click();
  assert.equal(await page.evaluate(() => localStorage.getItem('money-life-paper-plan')), previous.plan.id);
  await page.getByRole('button', {name: '생활 조건 변경', exact: true}).click();
  await page.locator('#paperconditions').getByLabel('월 소득 · 원', {exact: true}).fill('300000');
  await page.locator('#paperconditions').getByLabel('월 생활비 · 원', {exact: true}).fill('80000');
  await page.locator('#paperconditions').getByLabel('월 저축 이체액 · 원', {exact: true}).fill('0');
  await page.getByRole('button', {name: '변경 내용 확인', exact: true}).click();
  assert.match(await page.locator('#paperconditions').innerText(), /200,000원 → 300,000원/);
  assert.equal(await page.evaluate(() => localStorage.getItem('money-life-paper-pending')), null);
  await page.getByRole('button', {name: '다시 수정', exact: true}).click();
  assert.equal(await page.locator('#paperconditions').getByLabel('월 저축 이체액 · 원', {exact: true}).inputValue(), '0');
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
  await page.locator('#paperconditions').getByLabel('월 생활비 · 원', {exact: true}).fill('80000');
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
  await revealJourneyTools(page);
  await page.getByRole('button', {name: '모의투자 열기 ↗', exact: true}).click();
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
  await page.locator('#paperconditions').getByLabel('월 소득 · 원', {exact: true}).fill('-1');
  await page.getByRole('button', {name: '변경 내용 확인', exact: true}).click();
  assert.match(await page.locator('#papercondition-error').innerText(), /정수 원/);
  await page.locator('#paperconditions').getByLabel('월 소득 · 원', {exact: true}).fill('300000');
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

test('가상 뉴스 게임은 선택 미리보기·네 라운드·재시작·새로고침 복원을 지원한다', {timeout: 30000}, async t => {
  const page = await pageFor(t, {width: 390, height: 844});
  const original = await page.evaluate(() => localStorage.getItem('money-life-v1'));
  const writes = [];
  await page.route('**/api/**', route => { writes.push(route.request().method()); return route.abort(); });
  await page.getByRole('button', {name: '뉴스 게임 체험', exact: true}).click();
  const game = page.locator('#newsdemo');
  assert.match(await game.innerText(), /실제 뉴스·예측이 아니며/);
  await game.getByRole('button', {name: '보유 유지', exact: true}).click();
  assert.match(await game.locator('.news-preview').innerText(), /주가 변화 손익 -60,000원/);
  assert.equal(await game.locator('.news-round').innerText(), '0 / 4 라운드');
  await game.getByRole('button', {name: '절반 매도', exact: true}).click();
  assert.match(await game.locator('.news-preview').innerText(), /주가 변화 손익 -30,000원/);
  await game.getByRole('button', {name: '이 선택으로 라운드 진행'}).click();
  assert.match(await game.locator('.news-history').innerText(), /절반 매도/);
  assert.equal(await game.locator('.news-round').innerText(), '1 / 4 라운드');
  if (process.env.UI_SCREENSHOT_DIR) await page.locator('#modal').screenshot({path: path.join(process.env.UI_SCREENSHOT_DIR, 'news-game-mobile.png')});
  for (let i = 0; i < 3; i++) {
    await game.getByRole('button', {name: '보유 유지', exact: true}).click();
    await game.getByRole('button', {name: '이 선택으로 라운드 진행'}).click();
  }
  assert.equal(await game.locator('.news-history p').count(), 4);
  await game.locator('.news-finish').waitFor();
  assert.deepEqual(writes, []);
  assert.equal(await page.evaluate(() => localStorage.getItem('money-life-v1')), original);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.unroute('**/api/**');
  await page.reload();
  await page.getByRole('button', {name: '닫기', exact: true}).click();
  await revealJourneyTools(page);
  await page.getByRole('button', {name: '뉴스 게임 체험', exact: true}).click();
  assert.equal(await game.locator('.news-round').innerText(), '4 / 4 라운드');
  await game.getByRole('button', {name: '뉴스 게임 처음부터'}).click();
  assert.equal(await game.locator('.news-round').innerText(), '0 / 4 라운드');
});

test('저장 포트폴리오에서 시작한 뉴스 게임은 원본 주문과 가격을 바꾸지 않는다', {timeout: 30000}, async t => {
  const page = await pageFor(t);
  await demo(page);
  await page.getByLabel('주문 수량 · 주').fill('50');
  await clickCommand(page, '매수 예약', 'orders');
  const bundle = await clickCommand(page, '다음 달로 +1개월', 'advance');
  const before = await (await page.request.get('/api/paper-plans/' + bundle.plan.id)).json();
  const conditions = await (await page.request.get('/api/paper-plans/' + bundle.plan.id + '/conditions')).json();
  const final = bundle.run.result.invested.monthlyResults.at(-1);
  const expected = newsRules.play({cash: final.cash, saved: final.saved, quantity: final.investment.quantity,
    price: final.investment.price, unpaid: final.unpaid, income: conditions.values.income,
    expense: conditions.values.expense}, 'rates', 'hold');
  await page.getByRole('button', {name: '내 투자로 뉴스 체험'}).click();
  const game = page.locator('#newsportfolio');
  await game.getByRole('button', {name: '보유 유지', exact: true}).click();
  assert.match(await game.locator('.news-preview').innerText(), new RegExp(expected.stockChange.toLocaleString('ko-KR') + '원'));
  await game.getByRole('button', {name: '이 선택으로 라운드 진행'}).click();
  assert.equal(await page.evaluate(() => localStorage.getItem('money-life-paper-plan')), bundle.plan.id);
  const after = await (await page.request.get('/api/paper-plans/' + bundle.plan.id)).json();
  assert.deepEqual(after, before);
  if (process.env.UI_SCREENSHOT_DIR) await page.locator('#modal').screenshot({path: path.join(process.env.UI_SCREENSHOT_DIR, 'news-game-desktop.png')});
});

test('뉴스 게임 서버 저장·기록 복원·이어하기와 원본 사본 보존', {timeout: 30000}, async t => {
  const page = await pageFor(t, {width: 390, height: 844});
  await demo(page);
  const planId = await page.evaluate(() => localStorage.getItem('money-life-paper-plan'));
  await page.getByRole('button', {name: '내 투자로 뉴스 체험'}).click();
  const game = page.locator('#newsportfolio');
  await game.getByRole('button', {name: '보유 유지', exact: true}).click();
  await game.getByRole('button', {name: '이 선택으로 라운드 진행'}).click();
  const savedResponse = page.waitForResponse(r => r.url().endsWith('/news-games') && r.request().method() === 'POST');
  await game.getByRole('button', {name: '뉴스 진행 서버 저장'}).click();
  const saved = await savedResponse; assert.equal(saved.status(), 201);
  const record = await saved.json(); assert.equal(record.result.history.length, 1);
  await game.getByRole('button', {name: '현재 라운드 저장됨'}).waitFor();
  assert.equal(await game.getByRole('button', {name: '현재 라운드 저장됨'}).isDisabled(), true);
  await game.getByRole('button', {name: '뉴스 게임 처음부터'}).click();
  assert.equal(await game.locator('.news-round').innerText(), '0 / 4 라운드');
  await game.getByRole('button', {name: '저장한 뉴스 기록'}).click();
  await game.getByRole('button', {name: '이 기록 이어하기'}).click();
  assert.equal(await game.locator('.news-round').innerText(), '1 / 4 라운드');
  assert.match(await game.locator('.news-save-status').innerText(), /기록을 불러왔어요/);
  await game.getByRole('button', {name: '보유 유지', exact: true}).click();
  await game.getByRole('button', {name: '이 선택으로 라운드 진행'}).click();
  assert.equal(await game.locator('.news-round').innerText(), '2 / 4 라운드');
  assert.equal(await game.getByRole('button', {name: '뉴스 진행 서버 저장'}).isEnabled(), true);
  assert.equal(await page.evaluate(() => localStorage.getItem('money-life-paper-plan')), planId);
  if (process.env.UI_SCREENSHOT_DIR) {
    await game.getByRole('button', {name: '뉴스 진행 서버 저장'}).scrollIntoViewIfNeeded();
    await page.locator('#modal').screenshot({path: path.join(process.env.UI_SCREENSHOT_DIR, 'news-saved-mobile.png')});
  }
});

test('뉴스 저장 응답 유실 후 같은 요청 번호로 다시 확인해 중복 저장을 막는다', {timeout: 30000}, async t => {
  const page = await pageFor(t);
  await demo(page);
  const planId = await page.evaluate(() => localStorage.getItem('money-life-paper-plan'));
  await page.getByRole('button', {name: '내 투자로 뉴스 체험'}).click();
  const game = page.locator('#newsportfolio');
  await game.getByRole('button', {name: '보유 유지', exact: true}).click();
  await game.getByRole('button', {name: '이 선택으로 라운드 진행'}).click();
  let originalId;
  await page.route('**/api/paper-plans/*/news-games', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    originalId = route.request().postDataJSON().requestId;
    const accepted = await route.fetch(); assert.equal(accepted.status(), 201);
    await route.fulfill({status: 503, contentType: 'application/json', body: '{"detail":"API_UNAVAILABLE"}'});
  });
  await game.getByRole('button', {name: '뉴스 진행 서버 저장'}).click();
  await page.waitForFunction(() => document.querySelector('.news-save-status').textContent.includes('같은 저장 버튼'));
  await page.unroute('**/api/paper-plans/*/news-games');
  const retried = page.waitForResponse(r => r.url().endsWith('/news-games') && r.request().method() === 'POST');
  await game.getByRole('button', {name: '뉴스 진행 서버 저장'}).click();
  const response = await retried; assert.equal(response.status(), 201);
  assert.equal(response.request().postDataJSON().requestId, originalId);
  const records = await (await page.request.get('/api/paper-plans/' + planId + '/news-games')).json();
  assert.equal(records.length, 1);
});

test('뉴스 기록 세 개를 공통 라운드로 비교하고 네 번째 선택을 막는다', {timeout: 30000}, async t => {
  const page = await pageFor(t, {width: 390, height: 844});
  await demo(page);
  await page.getByLabel('주문 수량 · 주').fill('50');
  await clickCommand(page, '매수 예약', 'orders');
  const source = await clickCommand(page, '다음 달로 +1개월', 'advance');
  const saved = [];
  for (const choices of [['hold'], ['half', 'hold'], ['sell', 'hold', 'hold'], ['hold', 'hold']]) {
    const response = await page.request.post('/api/paper-plans/' + source.plan.id + '/news-games', {data: {requestId: crypto.randomUUID(), choices}});
    assert.equal(response.status(), 201); saved.push(await response.json());
  }
  await page.getByRole('button', {name: '내 투자로 뉴스 체험'}).click();
  const game = page.locator('#newsportfolio');
  const before = await page.evaluate(() => localStorage.getItem('money-life-news-rounds-v1'));
  await game.getByRole('button', {name: '저장한 뉴스 기록'}).click();
  const list = game.locator('.news-saved-records');
  assert.equal(await list.getByRole('button', {name: '선택한 뉴스 기록 비교'}).isDisabled(), true);
  for (const record of saved.slice(0, 3)) await list.locator(`input[value="${record.id}"]`).check();
  await list.locator(`input[value="${saved[3].id}"]`).click();
  assert.equal(await list.locator(`input[value="${saved[3].id}"]`).isChecked(), false);
  assert.match(await list.locator('.news-comparison-status').innerText(), /최대 3개/);
  await list.getByRole('button', {name: '선택한 뉴스 기록 비교'}).click();
  await list.getByRole('heading', {name: '1라운드까지 대응을 비교했어요'}).waitFor();
  const cards = list.locator('.news-comparison-cards');
  assert.match(await cards.innerText(), /1,140,000원/);
  assert.match(await cards.innerText(), /1,170,000원/);
  assert.match(await cards.innerText(), /1,200,000원/);
  assert.match(await cards.innerText(), /A 대비 순자산 \+60,000원/);
  assert.equal(await list.locator('.news-round-comparison article').count(), 1);
  assert.equal(await list.locator('svg path').count(), 3);
  assert.equal(await page.evaluate(() => localStorage.getItem('money-life-news-rounds-v1')), before);
  assert.equal(await page.evaluate(() => localStorage.getItem('money-life-paper-plan')), source.plan.id);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  if (process.env.UI_SCREENSHOT_DIR) {
    await list.locator('.news-comparison-cards').scrollIntoViewIfNeeded();
    await page.locator('#modal').screenshot({path: path.join(process.env.UI_SCREENSHOT_DIR, 'news-comparison-mobile.png')});
  }
  await list.getByRole('button', {name: '게임으로 돌아가기'}).click();
  assert.equal(await game.locator('.news-round').innerText(), '0 / 4 라운드');
});

test('뉴스 비교 실패 시 선택을 유지하고 다시 시도한다', {timeout: 30000}, async t => {
  const page = await pageFor(t);
  await demo(page);
  const planId = await page.evaluate(() => localStorage.getItem('money-life-paper-plan'));
  for (const choices of [['hold'], ['sell']]) {
    const response = await page.request.post('/api/paper-plans/' + planId + '/news-games', {data: {requestId: crypto.randomUUID(), choices}});
    assert.equal(response.status(), 201);
  }
  await page.getByRole('button', {name: '내 투자로 뉴스 체험'}).click();
  await page.getByRole('button', {name: '저장한 뉴스 기록'}).click();
  const list = page.locator('.news-saved-records');
  await list.getByRole('checkbox').first().waitFor();
  for (const checkbox of await list.getByRole('checkbox').all()) await checkbox.check();
  await page.route('**/api/news-game-comparisons', route => route.fulfill({status: 503, contentType: 'application/json', body: '{"detail":"NEWS_RESULT_INVALID"}'}));
  await list.getByRole('button', {name: '선택한 뉴스 기록 비교'}).click();
  await page.waitForFunction(() => document.querySelector('.news-comparison-status').textContent.includes('현재 선택'));
  assert.equal(await list.locator('input:checked').count(), 2);
  await page.unroute('**/api/news-game-comparisons');
  await list.getByRole('button', {name: '선택한 뉴스 기록 비교'}).click();
  await list.getByRole('heading', {name: '1라운드까지 대응을 비교했어요'}).waitFor();
});

test('새 재무 화면의 원 단위 입력·공용 계산·서버 저장·복원', {timeout: 30000}, async t => {
  const page = await pageFor(t);
  await page.locator('#ml-main-nav [data-page=finance]').click();
  await page.locator('#ml-cash').fill('100000');
  await page.locator('#ml-saved').fill('0');
  await page.locator('#ml-income').fill('1000000');
  await page.locator('#ml-expense').fill('600000');
  await page.locator('#ml-saving').fill('100000');
  await page.locator('#ml-start-rate').fill('0');
  await page.getByRole('button', {name: '이 조건으로 시뮬레이션 시작'}).click();
  await page.locator('#ml-one-month').click();
  assert.equal(await page.locator('#ml-game-net').innerText(), '500,000원');
  const response = page.waitForResponse(r => r.url().endsWith('/api/plan-saves') && r.request().method() === 'POST');
  await page.getByRole('button', {name: '서버 계산·저장', exact: true}).click();
  const plan = await (await response).json();
  assert.equal(plan.state.initial.income, 1000000);
  assert.equal(plan.state.initial.saved, 0);
  assert.equal(plan.state.month, 1);
  await page.waitForFunction(() => !serverPlanBusy);
  await page.reload(); await page.getByRole('button', {name: '닫기', exact: true}).click();
  await revealJourneyTools(page);
  assert.match(await page.locator('#ml-game-month-label').innerText(), /1 \/ 120/);
  assert.equal(await page.locator('#ml-game-net').innerText(), '500,000원');
  await page.getByRole('button', {name: '저장한 여정', exact: true}).click();
  await page.locator('#serverplans').getByRole('button').first().click();
  assert.equal(await page.locator('#ml-game-net').innerText(), '500,000원');
});

test('낮은 소득의 휴식 이벤트도 음수가 되지 않고 서버에 저장된다', {timeout: 30000}, async t => {
  const page = await pageFor(t);
  await page.evaluate(() => { JourneyStore.set("start",{...JourneyStore.get("start"),income:100}); JourneyStore.set("start",{...JourneyStore.get("start"),expense:60}); JourneyStore.set("month",30); render(); mlShowPage('dashboard'); nextEvent(); });
  const response = page.waitForResponse(r => r.url().endsWith('/api/event-branches') && r.request().method() === 'POST');
  await page.getByRole('button', {name: '나를 위한 휴식', exact: true}).click();
  assert.equal((await response).status(), 201);
  await page.waitForFunction(() => !serverPlanBusy && JourneyStore.get("events").has(30));
  assert.deepEqual(await page.evaluate(() => [simulate()[31].income, simulate()[33].income, simulate()[34].income]), [0, 0, 100]);
});

test('재질문 답변은 동일 계획·질문 ID에 연결하고 승인 전 상태를 유지한다', {timeout: 30000}, async t => {
  const page = await pageFor(t);
  await page.locator('#ml-main-nav [data-page=dashboard]').click();
  const before = await page.evaluate(() => localStorage.getItem('money-life-v1'));
  const clarificationId = crypto.randomUUID(), requests = [];
  await page.route('**/api/ai/parse-change', async route => {
    const body = route.request().postDataJSON(); requests.push(body);
    const data = requests.length === 1 ? {status:'needs_clarification', question:'얼마를 줄일까요?', clarificationId}
      : {status:'ready', proposalId:crypto.randomUUID(), changes:[], preview:['다음 달부터 생활비 200,000원 감소'], question:null};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({basePlanId:body.planId,message:'생활비 줄여줘',...data})});
  });
  await page.getByLabel('조건 변경 요청').fill('생활비 줄여줘');
  await page.getByRole('button', {name: '변경안 확인', exact: true}).click();
  await page.getByLabel('추가 답변').fill('20만 원');
  await page.getByRole('button', {name: '답변 보내기'}).click();
  await page.getByRole('button', {name: '확인하고 새 계획 계산'}).waitFor();
  assert.equal(requests[1].planId, requests[0].planId);
  assert.equal(requests[1].clarificationId, clarificationId);
  assert.equal(requests[1].message, '20만 원');
  assert.equal(await page.evaluate(() => localStorage.getItem('money-life-v1')), before);
});

test('늦은 AI 적용 응답은 그동안 바꾼 최신 조건을 덮어쓰지 않는다', {timeout: 30000}, async t => {
  const page = await pageFor(t);
  await page.locator('#ml-main-nav [data-page=dashboard]').click();
  let planId, release;
  const delay = new Promise(resolve => { release = resolve; });
  await page.route('**/api/ai/parse-change', async route => {
    planId = route.request().postDataJSON().planId;
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({basePlanId:planId,message:'생활비 줄여줘',status:'ready',proposalId:crypto.randomUUID(),preview:['생활비 변경'],changes:[]})});
  });
  await page.route('**/api/ai/proposals/*/apply', async route => {
    await delay;
    const plan = await (await page.request.get('/api/plans/' + planId)).json();
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({plan,run:{id:crypto.randomUUID()},explanation:'계산 결과'})});
  });
  await page.getByLabel('조건 변경 요청').fill('생활비 줄여줘');
  await page.getByRole('button', {name: '변경안 확인', exact: true}).click();
  await page.waitForFunction(() => !serverPlanBusy);
  await page.getByRole('button', {name: '확인하고 새 계획 계산'}).click();
  await page.waitForFunction(() => serverPlanBusy);
  await page.evaluate(() => { JourneyStore.set("start",{...JourneyStore.get("start"),income:123}); render(); });
  release();
  await page.waitForFunction(() => !serverPlanBusy);
  assert.equal(await page.evaluate(() => JourneyStore.get("start").income), 123);
  assert.match(await page.locator('#serverstatus').innerText(), /현재 변경은 유지/);
});

test('새 모바일 메뉴에서 재무 입력·목표·투자 화면을 이동할 수 있다', {timeout: 30000}, async t => {
  const page = await pageFor(t, {width: 390, height: 844});
  await page.locator('#ml-mobile-toggle').click();
  await page.locator('#ml-main-nav [data-page=finance]').click();
  await page.locator('#ml-finance-form').waitFor({state:'visible'});
  assert.equal(await page.locator('#ml-mobile-toggle').getAttribute('aria-expanded'), 'false');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.locator('#ml-mobile-toggle').click();
  await page.locator('#ml-main-nav [data-page=goal]').click();
  await page.locator('#ml-goal-form').waitFor({state:'visible'});
  await page.locator('#ml-mobile-toggle').click();
  await page.locator('#ml-main-nav [data-page=investment]').click();
  await page.getByRole('button', {name:'예시 조건으로 체험', exact:true}).waitFor();
});

test('생애 이벤트는 원본과 새 계획을 함께 저장하고 선택을 한 번만 반영한다', async (t) => {
  const page = await pageFor(t);
  await page.evaluate(() => { closeModal(); JourneyStore.set("month",12); render(); eventPreview(12); });
  const saved = page.waitForResponse(r => r.url().endsWith('/api/event-branches') && r.status() === 201);
  await page.getByRole('button', {name: '지금 독립할래요', exact: true}).click();
  const response = await saved;
  const result = await response.json();
  await page.waitForFunction(() => JourneyStore.get("events").has(12));
  assert.equal(result.plan.parentPlanId, result.basePlan.id);
  assert.equal(await page.evaluate(() => JourneyStore.get("mods").filter(c => c.type === 'once').length), 1);
  assert.equal(await page.evaluate(() => serverPlanId), result.plan.id);
});

test('만료 세션 안내에서 새 세션을 시작해도 로컬 여정은 유지된다', async (t) => {
  const page = await pageFor(t);
  await page.evaluate(() => { closeModal(); JourneyStore.set("month",12); render(); });
  await page.context().addCookies([{name: 'moneylife_guest', value: 'expired-session', url}]);
  await page.evaluate(() => saveServerPlan());
  await page.getByRole('button', {name: '새 세션으로 계속하기', exact: true}).click();
  await page.waitForFunction(() => !serverPlanBusy && document.getElementById('overlay').classList.contains('hidden'));
  assert.equal(await page.evaluate(() => JourneyStore.get("month")), 12);
  assert.equal(await page.evaluate(() => serverPlanId), null);
  await page.evaluate(() => saveServerPlan());
  await page.waitForFunction(() => !serverPlanBusy && serverPlanId !== null);
});

test('AI 승인 전 항목별 변경 금액·기간과 요청 수정은 현재 여정을 보존한다', async t => {
  const page = await pageFor(t);
  await page.locator('#ml-main-nav [data-page=dashboard]').click();
  await page.evaluate(() => closeModal());
  const before = await page.evaluate(() => aiSnapshot());
  let applyCalls = 0;
  await page.route('**/api/ai/parse-change', async route => {
    const input = route.request().postDataJSON();
    await route.fulfill({status:200, contentType:'application/json', body:JSON.stringify({
      status:'ready', basePlanId:input.planId, message:input.message, proposalId:crypto.randomUUID(), preview:[],
      previewDetails:[{field:'expense', label:'월 생활비',operation:'subtract',amount:200000,
        startMonth:'2027-03',endMonth:'2036-10',segments:[{startMonth:'2027-03',endMonth:'2036-10',before:1600000,after:1400000}]}]
    })});
  });
  await page.route('**/api/ai/proposals/**/apply', route => {applyCalls++; return route.abort();});
  await page.locator('#ask').fill('내년 3월부터 생활비 20만원 줄여줘');
  await page.evaluate(() => askServer());
  const detail = page.locator('.ai-change-detail');
  await detail.waitFor();
  assert.match(await detail.innerText(), /1,600,000원 → 1,400,000원/);
  assert.match(await detail.innerText(), /2027년 3월 ~ 2036년 10월/);
  await page.getByRole('button', {name:'요청 수정',exact:true}).click();
  assert.equal(await page.locator('#ask').inputValue(), '내년 3월부터 생활비 20만원 줄여줘');
  assert.deepEqual(await page.evaluate(() => aiSnapshot()), before);
  assert.equal(applyCalls, 0);
});

test('저장한 여정을 불러오면 목표 이름과 기한도 해당 계획으로 돌아온다', async t => {
  const page=await pageFor(t);
  const id=await page.evaluate(async()=>{
    closeModal();JourneyStore.set('goalName','목표 A');JourneyStore.set('goalMonths',24);
    await saveServerPlan();return serverPlanId;
  });
  await page.evaluate(async id=>{
    JourneyStore.set('goalName','목표 B');JourneyStore.set('goalMonths',60);render();
    await loadServerPlan(id);
  },id);
  assert.equal(await page.evaluate(()=>JourneyStore.current.goalName),'목표 A');
  assert.equal(await page.evaluate(()=>JourneyStore.current.goalMonths),24);
  assert.equal(await page.locator('#ml-goal-months').inputValue(),'24');
});

test('모의투자 미확인 요청이 남아도 새 세션에서 새 연습을 시작할 수 있다', async t => {
  const page=await pageFor(t);await demo(page);
  const oldId=await page.evaluate(()=>localStorage.getItem('money-life-paper-plan'));
  await page.route('**/api/paper-plans/*/orders',route=>route.abort());
  await page.getByLabel('주문 수량 · 주').fill('1');
  await page.getByRole('button',{name:'매수 예약',exact:true}).click();
  await page.getByRole('button',{name:'예약 확정',exact:true}).click();
  await page.waitForFunction(()=>!serverPlanBusy && !!localStorage.getItem('money-life-paper-pending'));
  await page.unroute('**/api/paper-plans/*/orders');
  await page.context().addCookies([{name:'moneylife_guest',value:'expired-session',url}]);
  await page.getByRole('button',{name:'같은 요청 다시 확인',exact:true}).click();
  await page.getByRole('button',{name:'새 세션으로 계속하기',exact:true}).click();
  await page.waitForFunction(()=>!serverPlanBusy && !localStorage.getItem('money-life-paper-pending'));
  assert.equal(await page.evaluate(()=>localStorage.getItem('money-life-paper-plan')),null);
  const archive=await page.evaluate(()=>JSON.parse(localStorage.getItem('money-life-paper-pending-archive')));
  assert.equal(archive[0].request.parentId,oldId);
  assert.equal(await page.getByRole('button',{name:'새 투자 연습',exact:true}).isEnabled(),true);
  await page.getByRole('button',{name:'새 투자 연습',exact:true}).click();await demo(page);
});

test('이벤트 저장 응답이 유실돼도 새로고침 후 같은 ID로 결과를 복원한다', async t => {
  const page=await pageFor(t);
  await page.evaluate(()=>{closeModal();JourneyStore.set('month',12);render();eventPreview(12);});
  let firstId,secondId;
  await page.route('**/api/event-branches',async route=>{
    firstId=route.request().postDataJSON().requestId;
    await route.fetch();await route.abort();
  });
  await page.getByRole('button',{name:'지금 독립할래요',exact:true}).click();
  await page.waitForFunction(()=>!serverPlanBusy && !!localStorage.getItem('money-life-event-pending'));
  await page.unroute('**/api/event-branches');
  await page.reload();await page.getByRole('button',{name:'닫기',exact:true}).click();
  await revealJourneyTools(page);
  const response=page.waitForResponse(r=>r.url().endsWith('/api/event-branches')&&r.status()===201);
  page.on('request',request=>{if(request.url().endsWith('/api/event-branches'))secondId=request.postDataJSON().requestId;});
  await page.getByRole('button',{name:'이전 선택 결과 확인',exact:true}).click();
  const result=await (await response).json();
  await page.waitForFunction(()=>!serverPlanBusy && JourneyStore.current.events.has(12));
  assert.equal(firstId,secondId);
  assert.equal(await page.evaluate(()=>localStorage.getItem('money-life-event-pending')),null);
  assert.equal(result.plan.state.changes.find(c=>c.type==='once').v,3000000);
  const plans=await page.evaluate(()=>planRequest(''));
  assert.equal(plans.length,2);
});

test('계산 실패 후 새로고침해도 같은 계획과 계산 요청으로 재시도한다',async t=>{
 const page=await pageFor(t);let saveIds=[],runIds=[];
 page.on('request',r=>{if(r.method()!=='POST')return;if(r.url().endsWith('/api/plan-saves'))saveIds.push(r.postDataJSON().requestId);if(r.url().endsWith('/api/simulations'))runIds.push(r.postDataJSON().requestId);});
 await page.route('**/api/simulations',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({detail:'ENGINE_UNAVAILABLE'})}));
 await page.evaluate(()=>saveServerPlan());
 assert.match(await page.locator('#serverstatus').innerText(),/계획은 저장/);
 await page.unroute('**/api/simulations');
 await page.reload();await page.getByRole('button',{name:'닫기',exact:true}).click();
  await revealJourneyTools(page);
 await page.getByRole('button',{name:'이전 저장 결과 확인',exact:true}).click();
 await page.waitForFunction(()=>!serverPlanBusy&&!planSaves.get());
 assert.equal(saveIds.length,2);assert.equal(saveIds[0],saveIds[1]);assert.equal(runIds[0],runIds[1]);
 const plans=await page.evaluate(()=>planRequest(''));assert.equal(plans.length,1);
 const runs=await page.evaluate(id=>simulationRequest('?planId='+id),plans[0].id);assert.equal(runs.length,1);
});

test('두 탭에서 같은 모의투자 요청을 동시에 보내지 않는다',async t=>{
 const page=await pageFor(t);await demo(page);
 let release,seen;const waiting=new Promise(resolve=>{release=resolve;});const requested=new Promise(resolve=>{seen=resolve;});
 await page.route('**/api/paper-plans/*/advance',async route=>{seen();await waiting;const response=await route.fetch();await route.fulfill({response});});
 await page.getByRole('button',{name:'다음 달로 +1개월',exact:true}).click();await requested;
 const other=await page.context().newPage();await other.goto(url);await other.getByRole('button',{name:'닫기',exact:true}).click();await other.getByRole('button',{name:'은행에서 모의투자 열기',exact:true}).click();
 const before=await page.evaluate(()=>localStorage.getItem('money-life-paper-pending'));
 await other.getByRole('button',{name:'같은 요청 다시 확인',exact:true}).click();
 await other.waitForFunction(()=>document.querySelector('#paperstatus').textContent.includes('다른 탭'));
 assert.match(await other.locator('#paperstatus').innerText(),/다른 탭/);
 assert.equal(await other.evaluate(()=>localStorage.getItem('money-life-paper-pending')),before);
 release();await page.waitForFunction(()=>!serverPlanBusy&&!localStorage.getItem('money-life-paper-pending'));
 const plans=await page.evaluate(()=>apiRequest('paper-plans',''));assert.equal(plans.length,2);
});

test('목표 반올림 경계에서도 화면과 서버 목표 월이 일치한다',async t=>{
 const page=await pageFor(t);
 const result=await page.evaluate(async()=>{
  closeModal();JourneyStore.set('start',{...JourneyStore.current.start,cash:989.9753,saved:10,income:0,expense:0,target:1000});JourneyStore.set('baseSaving',0);JourneyStore.set('baseRate',3);render();
  const previewGoal=GameEngine.goalMonth(simulate(),JourneyStore.current.start.target);
  await saveServerPlan();const runs=await simulationRequest('?planId='+serverPlanId);return {previewGoal,serverGoal:runs[0].summary.goalMonth};
 });
 assert.deepEqual(result,{previewGoal:1,serverGoal:1});
});

for (const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
  test(`AI 적용 실패 재확인과 변경 전후 수치 표시 · ${viewport.width}px`, {timeout:30000}, async t => {
    const page=await pageFor(t,viewport);
    await page.evaluate(()=>closeModal());
    if(viewport.width<700)await page.locator('#ml-mobile-toggle').click();
    await page.locator('#ml-main-nav [data-page=dashboard]').click();
    const before=await page.evaluate(()=>JSON.stringify(JourneyStore.snapshot()));
    const proposalId=crypto.randomUUID();let basePlan,applyCalls=0;
    await page.route('**/api/ai/parse-change',async route=>{
      basePlan=await (await page.request.get('/api/plans/'+route.request().postDataJSON().planId)).json();
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({status:'ready',proposalId,message:'다음 달부터 생활비 20만원 줄여줘',preview:['생활비 200,000원 감소'],changes:[]})});
    });
    await page.route('**/api/ai/proposals/*/apply',async route=>{
      assert.ok(route.request().url().includes(proposalId));applyCalls++;
      if(applyCalls===1){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({detail:'ENGINE_UNAVAILABLE'})});return;}
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
        plan:basePlan,run:{id:crypto.randomUUID(),months:120},explanation:'서버에서 계산한 비교 결과입니다.',
        comparison:{baseGoalMonth:null,candidateGoalMonth:0,finalAssetsDifference:24000000,shortageMonthsDifference:-3}
      })});
    });
    await page.locator('#ask').fill('다음 달부터 생활비 20만원 줄여줘');
    await page.getByRole('button',{name:'변경안 확인',exact:true}).click();
    await page.getByRole('button',{name:'확인하고 새 계획 계산',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>JSON.stringify(JourneyStore.snapshot())),before);
    await page.getByRole('button',{name:'확인하고 새 계획 계산',exact:true}).click();
    await page.waitForFunction(()=>!serverPlanBusy&&document.querySelector('#aistatus')?.textContent.includes('같은 확인 버튼'));
    assert.equal(await page.evaluate(()=>JSON.stringify(JourneyStore.snapshot())),before);
    await page.getByRole('button',{name:'확인하고 새 계획 계산',exact:true}).click();
    await page.locator('#aicomparison').waitFor();
    const text=await page.locator('#aicomparison').innerText();
    for(const value of ['기간 내 미달성','시작 시점 달성','+24,000,000원','-3개월','새 계획 − 원본'])assert.ok(text.includes(value),value);
    assert.equal(applyCalls,2);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  });
}

test('저장된 AI 계산을 다시 열면 비교 지표도 표시한다',async t=>{
  const page=await pageFor(t);
  const run=await page.evaluate(async()=>{
    closeModal();await saveServerPlan();
    const runs=await simulationRequest('?planId='+serverPlanId);
    return simulationRequest('/'+runs[0].id);
  });
  run.inputSnapshot.aiComparison={baseGoalMonth:12,candidateGoalMonth:10,finalAssetsDifference:24000000,shortageMonthsDifference:0};
  await page.route('**/api/simulations/'+run.id,route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(run)}));
  await page.getByRole('button',{name:'계산 결과',exact:true}).click();
  const comparison=page.locator('#saved-ai-comparison');await comparison.waitFor();
  await page.waitForFunction(()=>document.querySelector('#saved-ai-comparison').textContent.includes('24,000,000'));
  const text=await comparison.innerText();
  for(const value of ['12개월차','10개월차','+24,000,000원','0개월'])assert.ok(text.includes(value),value);
});

for (const width of [1440, 390]) {
  test(`게임 첫 화면의 장면·월 진행·상세 열기 · ${width}px`, {timeout:30000}, async t => {
    const context = await browser.newContext({viewport:{width,height:900},baseURL:url});
    t.after(() => context.close());
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await page.getByRole('button',{name:'닫기',exact:true}).click();
    assert.equal(await page.locator('body').evaluate(el => el.classList.contains('is-playing')), true);
    assert.equal(await page.locator('.ml-sidebar').isVisible(), false);
    assert.equal(await page.locator('#play-details').getAttribute('open'), null);
    assert.equal(await page.locator('.journey-drawer').getAttribute('open'), null);
    assert.equal(await page.locator('.play-scenery').evaluate(img => img.complete && img.naturalWidth > 0), true);
    await page.getByRole('button',{name:'한 달 살아보기 →',exact:true}).click();
    assert.equal(await page.evaluate(() => JourneyStore.current.month), 1);
    assert.match(await page.locator('#game-month-receipt').innerText(), /들어온 소득/);
    await page.getByRole('button',{name:/AI로 계획 바꾸기/}).click();
    assert.equal(await page.locator('#ask').isVisible(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.getByRole('button',{name:/다른 미래와 비교/}).click();
    assert.equal(await page.locator('#ml-page-report').isVisible(), true);
    await page.locator('.play-header-tools').getByRole('button',{name:'나의 인생',exact:true}).click();
    await page.getByRole('button',{name:'집에서 독립 선택 살펴보기',exact:true}).click();
    await page.getByRole('button',{name:'다음 인생 선택 만나기',exact:true}).click();
    assert.equal(await page.locator('#overlay').getAttribute('data-scene'), 'event');
    assert.match(await page.locator('.game-event-forecast').innerText(), /지금 계획/);
    assert.equal(await page.evaluate(() => JourneyStore.current.month), 12);
    assert.deepEqual(errors, []);
  });
}

for (const width of [1440,390]) {
  test(`증권 화면의 종가 차트·주문·월 진행 · ${width}px`, {timeout:30000}, async t => {
    const page=await pageFor(t,{width,height:1000});
    await demo(page);
    await page.locator('.stock-market').waitFor();
    assert.equal(await page.locator('.stock-ticket').getByRole('heading',{name:'주문하기',exact:true}).isVisible(),true);
    assert.equal(await page.locator('.stock-market svg').count(),1);
    assert.equal(await page.locator('.stock-price-dot').count(),1);
    assert.equal(await page.getByRole('slider',{name:'주가 시점 탐색'}).isEnabled(),false);
    const first=await page.locator('.stock-readout').innerText();
    await page.getByLabel('주문 수량 · 주').fill('5');
    await clickCommand(page,'매수 예약','orders');
    await clickCommand(page,'다음 달로 +1개월','advance');
    assert.equal(await page.locator('.stock-buy-mark').count(),1);
    assert.equal(await page.locator('.stock-holding-row').count(),1);
    const current=await page.locator('.stock-readout').innerText();
    assert.notEqual(first,current);
    await page.getByRole('slider',{name:'주가 시점 탐색'}).press('Home');
    assert.equal(await page.locator('.stock-readout').innerText(),first);
    await page.getByRole('slider',{name:'주가 시점 탐색'}).press('End');
    assert.equal(await page.locator('.stock-readout').innerText(),current);
    await page.locator('.stock-ranges').getByRole('button',{name:'6개월',exact:true}).click();
    assert.equal(await page.locator('.stock-ranges').getByRole('button',{name:'6개월',exact:true}).getAttribute('aria-pressed'),'true');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  });
}
