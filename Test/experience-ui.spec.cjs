// Character-led events and real monthly progression with explicit API fixtures.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {chromium}=require('playwright');
const path=require('node:path');
const catalog=require('../Shared/life-events.json');
const root=path.resolve(__dirname,'..');
const url='http://127.0.0.1:'+(process.env.EXPERIENCE_UI_PORT||5196);
let server,browser;
before(async()=>{
  server=spawn(process.execPath,['scripts/dev-server.cjs'],{cwd:root,env:{...process.env,PORT:new URL(url).port},stdio:'ignore'});
  for(let i=0;i<200;i++){try{if((await fetch(url)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({headless:true,...(process.platform==='win32'?{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}:{})});
});
after(async()=>{await browser?.close();if(server?.exitCode===null)await new Promise(r=>{server.once('exit',r);server.kill();});});
async function open(t,viewport={width:1366,height:900}){
  const context=await browser.newContext({viewport,reducedMotion:'reduce'});t.after(()=>context.close());
  const page=await context.newPage(),errors=[];
  await page.route('https://fonts.googleapis.com/**',route=>route.abort());
  page.on('pageerror',error=>errors.push(error.message));t.after(()=>assert.deepEqual(errors,[]));
  await page.goto(url);await page.locator('#game-continue').click();return page;
}
test('월 정산·작은 목표 달성·다음 장과 재접속은 실제 자산을 유지한다',{timeout:30000},async t=>{
  const page=await open(t);
  const expected=await page.evaluate(()=>simulate()[2].total);
  await page.locator('#ml-one-month').click();
  assert.equal(await page.locator('#life-settlement').isVisible(),true);
  assert.match(await page.locator('#life-settlement').innerText(),/저축 이동\s*700,000원/);
  await page.locator('#ml-one-month').click();
  await page.locator('#life-chapter-continue').waitFor();
  assert.equal(await page.locator('#overlay').getAttribute('data-scene'),'life-milestone');
  assert.equal(await page.evaluate(()=>simulate()[JourneyStore.current.month].total),expected);
  assert.equal(await page.evaluate(()=>JourneyStore.current.timer),null);
  await page.locator('#life-chapter-continue').click();
  assert.equal(await page.evaluate(()=>JourneyStore.current.month),2);
  assert.match(await page.locator('#ml-game-chapter').innerText(),/2장/);
  await page.reload();await page.locator('#game-continue').click();
  assert.equal(await page.locator('#overlay').isVisible(),false);
  assert.equal(await page.evaluate(()=>JourneyStore.current.month),2);
  await page.locator('.life-album-trigger').click();
  assert.equal(await page.locator('.life-chapter-step.is-complete').count(),1);
  assert.match(await page.locator('.life-chapter-list').innerText(),/2026년 12월/);
});

test('마을 이름표를 눌러 장소를 열고 결과 화면의 이야기에서 마을로 돌아온다',{timeout:30000},async t=>{
  const page=await open(t);
  await page.locator('.ml-building.home strong').click();await page.locator('#game-place-next').waitFor();
  assert.equal(await page.evaluate(()=>JourneyStore.current.month),0);await page.keyboard.press('Escape');
  await page.evaluate(()=>{JourneyStore.set('month',13);JourneyStore.set('events',new Set([12]));JourneyStore.set('logs',[{month:12,text:EV[12].a}]);render();});
  await page.locator('.ml-building.home strong').click();
  assert.equal(await page.locator('.life-place-wallet').isVisible(),true);
  assert.match(await page.locator('#modal').innerText(),/나의 집과 일상/);
  await page.keyboard.press('Escape');
  await page.locator('.play-header-tools [data-page="report"]').click();await page.locator('#life-report-story').click();
  await page.locator('#life-album-back').click();
  assert.equal(await page.locator('#ml-page-dashboard').isVisible(),true);
});

test('모바일에서는 날짜 옆에서 한 달을 진행하고 목표 초안은 화면 갱신에도 유지한다',{timeout:30000},async t=>{
  const page=await open(t,{width:320,height:740});
  const box=await page.locator('#life-step-control').boundingBox();
  assert.ok(box&&box.y+box.height<=740);
  await page.locator('#life-step-control').click();assert.equal(await page.evaluate(()=>JourneyStore.current.month),1);
  await page.locator('#ml-mobile-toggle').click();await page.locator('#ml-main-nav [data-page="goal"]').click();
  await page.locator('#ml-goal-amount').fill('87654321');
  await page.locator('#ml-goal-amount').evaluate(e=>e.setSelectionRange(3,3));
  await page.evaluate(()=>render());
  assert.equal(await page.locator('#ml-goal-amount').inputValue(),'87,654,321');
  assert.equal(await page.locator('#ml-goal-amount').evaluate(e=>e.selectionStart),3);
  assert.equal(await page.locator('#goal-save-state').innerText(),'저장 전 변경');
});

test('목표에 도달한 뒤 지출이 커지면 과거 달성과 현재 부족분을 구분한다',{timeout:30000},async t=>{
  const page=await open(t);
  await page.evaluate(()=>{JourneyStore.set('start',{...JourneyStore.current.start,target:1100});JourneyStore.set('mods',[{type:'once',v:2000,m:3,end:null}]);JourneyStore.set('month',3);render();});
  assert.match(await page.locator('#game-story-title').innerText(),/다시 준비/);
  assert.match(await page.locator('#game-story-body').innerText(),/지금은 목표보다.*부족/);
  assert.match(await page.locator('#life-mission-amount').innerText(),/−/);
  await page.locator('#life-mission-open').click();assert.equal(await page.locator('#ml-page-goal').isVisible(),true);
});

test('이벤트와 겹친 목표 달성은 선택 후 확인하고 닫은 팝업은 다시 강제하지 않는다',{timeout:30000},async t=>{
  const page=await open(t);
  await page.route('**/api/event-branches',async route=>{
    const command=route.request().postDataJSON(),state=structuredClone(command.base.state);
    state.events.push(12);state.logs.unshift({month:12,text:catalog.events[0].b});
    await route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({plan:{id:'coincident-goal',schemaVersion:1,goalBasis:'net_assets',state}})});
  });
  await page.evaluate(()=>{JourneyStore.set('start',{...JourneyStore.current.start,income:168.3334});JourneyStore.set('baseSaving',0);JourneyStore.set('baseRate',0);JourneyStore.set('month',11);render();});
  await page.locator('#ml-one-month').click();await page.locator('.eventoptions button').last().click();
  await page.waitForFunction(()=>JourneyStore.current.events.has(12)&&!serverPlanBusy);
  await page.locator('#game-choice-result button').first().click();
  await page.locator('#life-chapter-continue').waitFor();assert.equal(await page.evaluate(()=>JourneyStore.current.month),12);
  await page.keyboard.press('Escape');await page.locator('#game-choice-result button').first().click();
  assert.equal(await page.evaluate(()=>JourneyStore.current.month),13);
});

test('마지막 여정의 미달성 목표와 늦은 도달을 정확히 설명한다',{timeout:30000},async t=>{
  const page=await open(t);
  await page.evaluate(()=>{JourneyStore.set('start',{...JourneyStore.current.start,target:1000000});JourneyStore.set('month',120);render();LifeJourney.showAlbum();});
  assert.match(await page.locator('.life-chapter-list').innerText(),/이번 여정에서는 미도달/);
  assert.doesNotMatch(await page.locator('.life-chapter-list').innerText(),/앞으로 만들어갈/);
  assert.match(await page.locator('.life-empty').innerText(),/저장된 인생 선택이 없어요/);
  await page.keyboard.press('Escape');
  await page.evaluate(()=>{JourneyStore.set('start',{...JourneyStore.current.start,target:1100});JourneyStore.set('goalMonths',1);JourneyStore.set('month',1);LifeJourney.reset();render();});
  await page.locator('#ml-one-month').click();await page.locator('#life-next-goal').waitFor();
  assert.match(await page.locator('.life-goal-timing').innerText(),/기한보다 1개월 늦게/);
});

test('소득 없는 시작과 생활비 부족을 구분하고 작은 PC에서도 두 번째 목표가 겹치지 않는다',{timeout:30000},async t=>{
  const page=await open(t,{width:1024,height:560});
  await page.evaluate(()=>{window.originalStart={...JourneyStore.current.start};JourneyStore.set('month',2);render();});
  assert.match(await page.locator('#game-story-title').innerText(),/시작 생활비/);
  assert.equal(await page.locator('#ml-one-month').evaluate(button=>{const r=button.getBoundingClientRect();return button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),true);
  await page.evaluate(()=>{JourneyStore.set('start',{...originalStart,income:0,expense:0});JourneyStore.set('month',0);render();});
  assert.doesNotMatch(await page.locator('#ml-world-title').innerText(),/월급/);
  await page.locator('#ml-one-month').click();assert.match(await page.locator('#ml-world-title').innerText(),/소득 없이/);
  await page.evaluate(()=>{JourneyStore.set('start',{...originalStart,income:0,expense:50000});render();});
  assert.match(await page.locator('#game-story-body').innerText(),/부족액/);
  await page.locator('#life-mission-open').click();assert.equal(await page.locator('#ml-page-assets').isVisible(),true);
});

test('독립 선택은 다음 달에 마을을 바꾸고 다음 이벤트의 이야기에 이어진다',{timeout:30000},async t=>{
  const page=await open(t);
  await page.route('**/api/event-branches',async route=>{
    const command=route.request().postDataJSON(),state=structuredClone(command.base.state);
    const event=catalog.events.find(item=>item.month===command.eventMonth);
    state.events.push(event.month);state.logs.unshift({month:event.month,text:command.accepted?event.a:event.b});
    if(command.accepted)state.changes.push(...event.rule.effects.map(effect=>({type:effect.type,v:effect.value,m:event.month+1,end:null})));
    await route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({plan:{id:'life-story-fixture',schemaVersion:1,goalBasis:'net_assets',state}})});
  });
  await page.evaluate(()=>{JourneyStore.set('month',12);render();eventPreview(12);});
  await page.locator('.eventoptions button').first().click();
  await page.waitForFunction(()=>JourneyStore.current.events.has(12)&&!serverPlanBusy);
  assert.equal(await page.locator('.ml-world').getAttribute('data-life-home'),'family');
  await page.locator('#game-choice-result button').first().click();
  assert.equal(await page.evaluate(()=>JourneyStore.current.month),13);
  assert.equal(await page.locator('.ml-world').getAttribute('data-life-home'),'independent');
  assert.match(await page.locator('.ml-building.home strong').innerText(),/나의 집/);
  await page.reload();await page.locator('#game-continue').click();
  assert.equal(await page.locator('.ml-world').getAttribute('data-life-home'),'independent');
  await page.evaluate(()=>{JourneyStore.set('month',30);render();eventPreview(30);});
  assert.match(await page.locator('.life-event-context').innerText(),/독립을 선택한 뒤/);
  for(const [width,height] of [[1366,768],[375,667],[320,740]]){
    await page.setViewportSize({width,height});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    const box=await page.locator('#modal').boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.y+box.height<=height+1);
    await page.locator('.eventoptions button').last().scrollIntoViewIfNeeded();
    assert.equal(await page.locator('.eventoptions button').last().isEnabled(),true);
  }
});

test('낮은 PC 화면에서도 월 정산 뒤 진행 버튼과 다음 이벤트가 겹치지 않는다',{timeout:30000},async t=>{
  const page=await open(t,{width:1024,height:560});
  await page.locator('#ml-one-month').click();
  const fit=await page.locator('#ml-one-month').evaluate(button=>{
    const rect=button.getBoundingClientRect(),top=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
    const actor=document.querySelector('.play-avatar').getBoundingClientRect(),world=document.querySelector('.ml-world').getBoundingClientRect();
    return {clickable:button.contains(top),actorVisible:actor.bottom<=world.bottom+1&&actor.top>=world.top,overflow:document.documentElement.scrollHeight>innerHeight};
  });
  assert.deepEqual(fit,{clickable:true,actorVisible:true,overflow:false});
  await page.locator('#ml-one-month').click();await page.locator('#life-chapter-continue').waitFor();
});

test('한 달에 여러 목표를 넘으면 최종 목표를 축하하고 다음 목표는 직접 정한다',{timeout:30000},async t=>{
  const page=await open(t);
  await page.evaluate(()=>{JourneyStore.set('start',{...JourneyStore.current.start,target:1100,income:1000});render();});
  const expected=await page.evaluate(()=>simulate()[1].total);
  await page.locator('#ml-one-month').click();await page.locator('#life-next-goal').waitFor();
  assert.equal(await page.evaluate(()=>simulate()[1].total),expected);
  await page.locator('#life-next-goal').click();
  assert.equal(await page.locator('#ml-page-goal').isVisible(),true);
  assert.equal(await page.evaluate(()=>JourneyStore.current.start.target),1100);
});

test('목표와 인생 선택이 같은 달이면 선택 팝업을 먼저 보여준다',{timeout:30000},async t=>{
  const page=await open(t);
  await page.evaluate(()=>{JourneyStore.set('start',{...JourneyStore.current.start,income:168.3334});JourneyStore.set('baseSaving',0);JourneyStore.set('baseRate',0);JourneyStore.set('month',11);render();});
  await page.locator('#ml-one-month').click();
  assert.equal(await page.locator('#overlay').getAttribute('data-scene'),'event');
  await page.waitForTimeout(100);
  assert.equal(await page.locator('#overlay').getAttribute('data-scene'),'event');
  assert.equal(await page.locator('#life-chapter-continue').count(),0);
  assert.equal(await page.evaluate(()=>JourneyStore.current.month),12);
});

test('마지막 선택 뒤에는 남은 일상을 진행하고 120개월에서 여정을 마친다',{timeout:30000},async t=>{
  const page=await open(t);
  await page.evaluate(()=>{JourneyStore.set('events',new Set([12,30,48,72,96]));JourneyStore.set('month',97);JourneyStore.set('speed',12);render();});
  assert.match(await page.locator('#ml-event-title').innerText(),/내가 고른 삶/);
  await page.locator('#ml-event-yes').click();
  assert.notEqual(await page.evaluate(()=>JourneyStore.current.timer),null);
  await page.locator('#ml-event-yes').click();
  assert.equal(await page.evaluate(()=>JourneyStore.current.timer),null);
  assert.equal(await page.locator('#ml-page-dashboard').isVisible(),true);
  await page.evaluate(()=>{JourneyStore.set('month',119);render();});
  await page.locator('#ml-event-yes').click();
  await page.locator('#life-album-back').waitFor();
  assert.equal(await page.evaluate(()=>JourneyStore.current.month),120);
  assert.match(await page.locator('#ml-game-chapter').innerText(),/여정 완료/);
});

test('자동 실행은 매달 하나씩 정산하고 정지·배속·화면 이동을 존중한다',{timeout:30000},async t=>{
  const page=await open(t);
  await page.evaluate(()=>{
    window.observedMonths=[];const original=JourneyStore.increment;
    JourneyStore.increment=(key,amount)=>{const value=original(key,amount);if(key==='month')observedMonths.push(JourneyStore.current.month);return value;};
    JourneyStore.set('speed',12);render();
  });
  await page.locator('#game-play-toggle').click();
  await page.waitForFunction(()=>JourneyStore.current.month>=2);
  await page.locator('#life-chapter-continue').waitFor();
  const state=await page.evaluate(()=>({month:JourneyStore.current.month,timer:JourneyStore.current.timer,months:observedMonths,total:money(simulate()[JourneyStore.current.month].total)}));
  assert.equal(state.timer,null);assert.ok(state.month>=2&&state.month<12);
  assert.deepEqual(state.months,Array.from({length:state.month},(_,i)=>i+1));
  assert.equal(await page.locator('#ml-game-goal-current').innerText(),state.total);
  await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>JourneyStore.current.month),state.month);
  await page.locator('#life-chapter-continue').click();
  await page.locator('.play-speed > summary').click();await page.locator('[data-speed="4"]').click();
  assert.equal(await page.locator('.play-speed > summary').innerText(),'4×');
  assert.equal(await page.evaluate(()=>JourneyStore.current.timer),null);
  await page.locator('#game-play-toggle').click();
  assert.equal(await page.locator('#game-play-toggle').getAttribute('aria-pressed'),'true');
  await page.locator('.play-header-tools [data-page="report"]').click();
  assert.equal(await page.evaluate(()=>JourneyStore.current.timer),null);
  assert.equal(await page.locator('#ml-page-report').isVisible(),true);
});
test('이벤트에서는 시간이 멈추고 중앙 팝업만 강조된다',{timeout:30000},async t=>{
  const page=await open(t);
  await page.evaluate(()=>{JourneyStore.set('month',11);JourneyStore.set('speed',12);render();});
  await page.locator('#game-play-toggle').click();await page.waitForFunction(()=>!document.getElementById('overlay').classList.contains('hidden'));
  assert.equal(await page.evaluate(()=>JourneyStore.current.month),12);
  assert.equal(await page.evaluate(()=>JourneyStore.current.timer),null);
  assert.equal(await page.locator('#overlay').getAttribute('data-scene'),'event');
  assert.equal(await page.locator('.event-spotlight-actor').count(),0);
  assert.equal(await page.locator('#money-life-app').evaluate(e=>e.inert),true);
  assert.equal(await page.locator('.play-avatar').evaluate(e=>getComputedStyle(e).visibility),'visible');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).overflowY),'hidden');
  const before=await page.evaluate(()=>JourneyStore.snapshot());
  for(const [width,height]of [[1366,768],[375,667],[320,740],[1024,600]]){
    await page.setViewportSize({width,height});
    const panel=await page.locator('#modal').boundingBox();
    assert.ok(panel.x>=0&&panel.x+panel.width<=width&&panel.y>=0);
    assert.ok(panel.y+panel.height<=height,'popup fits within the screen');
    assert.ok(Math.abs(panel.y+panel.height/2-height/2)<2,'popup is vertically centered');
    assert.equal(await page.locator('#modal').evaluate(e=>e.scrollHeight<=e.clientHeight+1),true,'choices fit without scrolling');
  }
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#money-life-app').evaluate(e=>e.inert),false);
  assert.deepEqual(await page.evaluate(()=>JourneyStore.snapshot()),before);
  await page.locator('#game-play-toggle').click();
  assert.equal(await page.locator('#overlay').isVisible(),true,'unanswered event opens again instead of skipping a month');
  assert.equal(await page.evaluate(()=>JourneyStore.current.month),12);
});
test('선택 저장 실패는 팝업에서 재시도하며 중복 요청·자동 재개를 막는다',{timeout:30000},async t=>{
  const page=await open(t,{width:375,height:667});let calls=0,requestId;
  let releaseSave;const pendingSave=new Promise(resolve=>{releaseSave=resolve;});t.after(()=>releaseSave());
  await page.route('**/api/event-branches',async route=>{
    const command=route.request().postDataJSON();calls++;
    if(calls===1){requestId=command.requestId;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({detail:'DATABASE_UNAVAILABLE'})});return;}
    assert.equal(command.requestId,requestId);
    await pendingSave;
    const state=structuredClone(command.base.state);state.events.push(command.eventMonth);state.logs.unshift({month:command.eventMonth,text:catalog.events[0].b});
    await route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({plan:{id:'event-fixture',schemaVersion:1,goalBasis:'net_assets',state}})});
  });
  await page.evaluate(()=>{JourneyStore.set('month',12);render();eventPreview(12);});
  const before=await page.evaluate(()=>JourneyStore.snapshot());
  const choice=page.getByRole('button',{name:catalog.events[0].b,exact:true});await choice.click();
  await page.waitForFunction(()=>document.getElementById('life-event-feedback').dataset.state==='error');
  assert.deepEqual(await page.evaluate(()=>JourneyStore.snapshot()),before);
  await choice.click();
  await page.waitForFunction(()=>serverPlanBusy);
  assert.equal(await choice.isDisabled(),true);
  releaseSave();
  await page.waitForFunction(()=>JourneyStore.current.events.has(12));
  assert.equal(calls,2);assert.equal(await page.locator('#overlay').isVisible(),false);
  assert.equal(await page.locator('#game-choice-result').isVisible(),true);
  assert.equal(await page.evaluate(()=>JourneyStore.current.timer),null);
  await page.evaluate(()=>{JourneyStore.set('speed',12);render();});await page.locator('#game-play-toggle').click();
  await page.waitForFunction(()=>JourneyStore.current.month>=13);await page.locator('#game-play-toggle').click();
  assert.equal(await page.evaluate(()=>JourneyStore.current.events.size),1);
});
test('120개월에서 정지하고 전체 화면·모바일 메뉴와 계획 비교가 연결된다',{timeout:30000},async t=>{
  const page=await open(t);
  await page.evaluate(()=>{JourneyStore.set('month',119);JourneyStore.set('speed',12);render();});
  await page.locator('#game-play-toggle').click();await page.waitForFunction(()=>JourneyStore.current.month===120&&!JourneyStore.current.timer);
  await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>JourneyStore.current.month),120);
  assert.equal(await page.locator('#overlay').getAttribute('data-scene'),'life-album');
  await page.locator('#life-album-back').click();
  await page.locator('#game-play-toggle').click();assert.equal(await page.locator('#ml-page-report').isVisible(),true);
  for(const width of [1366,820,375,320]){
    await page.setViewportSize({width,height:844});
    for(const screen of ['finance','assets','goal','settings','report','dashboard']){
      await page.locator('#ml-mobile-toggle').click();await page.locator('#ml-main-nav [data-page='+screen+']').click();
      assert.equal(await page.locator('#ml-page-'+screen).isVisible(),true);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${width}px ${screen}`);
    }
    await page.locator('#ml-mobile-toggle').click();await page.locator('#ml-main-nav [data-page="report"]').click();
    if(width<761){await page.getByRole('tab',{name:'처음 계획',exact:true}).click();assert.equal(await page.locator('#experience-report-0').isVisible(),true);assert.equal(await page.locator('#experience-report-1').isVisible(),false);}
  }
});

test('재무 입력 초안은 화면 이동 뒤에도 유지되고 새 여정을 시작하면 확정된다',{timeout:30000},async t=>{
  const page=await open(t);
  await page.locator('.play-header-tools [data-page="finance"]').click();
  await page.locator('#ml-income').fill('3450000');
  await page.locator('#ml-start-name').fill('입력 중인 나의 여정');
  await page.locator('.experience-back').filter({visible:true}).click();
  assert.equal(await page.evaluate(()=>JourneyStore.current.start.income),250);
  await page.locator('.play-header-tools [data-page="finance"]').click();
  assert.equal(await page.locator('#ml-income').inputValue(),'3,450,000');
  assert.equal(await page.locator('#ml-start-name').inputValue(),'입력 중인 나의 여정');
  await page.locator('#ml-finance-form button[type="submit"]').click();
  assert.equal(await page.evaluate(()=>JourneyStore.current.start.income),345);
  assert.equal(await page.locator('#ml-page-dashboard').isVisible(),true);
});

test('메뉴 키보드 닫기·일관된 아이콘·빈 설정값 검증을 지원한다',{timeout:30000},async t=>{
  const page=await open(t);
  await page.locator('#ml-mobile-toggle').click();
  await page.locator('#ml-main-nav [data-page="settings"]').focus();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#ml-mobile-toggle').getAttribute('aria-expanded'),'false');
  assert.equal(await page.locator('#ml-mobile-toggle').evaluate(e=>e===document.activeElement),true);
  await page.locator('#ml-mobile-toggle').click();
  await page.locator('#ml-main-nav [data-page="settings"]').click();
  assert.equal(await page.locator('#ml-main-nav .ml-icon').count(),7);
  const before=await page.evaluate(()=>JSON.stringify(JourneyStore.snapshot()));
  await page.locator('#ml-setting-saving').fill('');
  await page.locator('#ml-apply-settings').click();
  assert.equal(await page.locator('#ml-setting-saving').evaluate(e=>e.validity.valueMissing),true);
  assert.equal(await page.evaluate(()=>JSON.stringify(JourneyStore.snapshot())),before);
  await page.locator('#ml-setting-saving').fill('800000');
  await page.locator('#ml-apply-settings').click();
  assert.match(await page.locator('#toast').innerText(),/次|다음 달/);
  await page.locator('#ml-page-settings .experience-back').click();
  await page.evaluate(()=>{JourneyStore.set('month',120);render();mlShowPage('settings');});
  assert.equal(await page.locator('#ml-apply-settings').isDisabled(),true);
  assert.match(await page.locator('#experience-settings-note').innerText(),/끝났어요/);
});

test('PC에서는 목표·마을·진행·이벤트가 한 화면에 들어오며 상세 창에서 돌아올 수 있다',{timeout:30000},async t=>{
  const page=await open(t);
  for(const [width,height]of [[1920,1080],[1536,864],[1366,768],[1280,720],[1100,650],[1366,625],[1280,600],[1092,590],[1024,560]]){
    await page.setViewportSize({width,height});
    const layout=await page.evaluate(()=>{
      const goal=document.querySelector('.play-objective'), tools=document.querySelector('.play-toolbelt');
      return{height:document.documentElement.scrollHeight, viewport:innerHeight,
        goalBottom:goal.getBoundingClientRect().bottom, goalFits:goal.scrollHeight<=goal.clientHeight+1,
        toolsTop:tools.getBoundingClientRect().top};
    });
    assert.ok(layout.height<=layout.viewport,'desktop game needs no vertical page scrolling');
    assert.ok(layout.goalBottom<=layout.toolsTop&&layout.goalFits,'wallet and navigation never overlap');
    for(const selector of ['.ml-world','#game-play-toggle','#ml-one-month','#ml-event-yes']){
      const bounds=await page.locator(selector).boundingBox();
      assert.ok(bounds.y>=0&&bounds.y+bounds.height<=height,selector+' stays on screen');
    }
  }
  await page.setViewportSize({width:1366,height:768});
  await page.locator('.desktop-storage-trigger').click();
  assert.equal(await page.locator('#play-details').getAttribute('open'),'');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#play-details').getAttribute('open'),null);
  await page.locator('.play-toolbelt button').last().click();
  assert.equal(await page.locator('#ask').isVisible(),true);
  await page.locator('.play-toolbelt [data-page="report"]').click();
  await page.locator('.play-header-tools [data-page="dashboard"]').click();
  assert.equal(await page.locator('#play-details').getAttribute('open'),null);
});

test('목표 입력 오류는 필드 옆에 표시하고 올바르게 고친 뒤에만 저장한다',{timeout:30000},async t=>{
  const page=await open(t,{width:390,height:844});
  await page.locator('#ml-mobile-toggle').click();await page.locator('#ml-main-nav [data-page="goal"]').click();
  const before=await page.evaluate(()=>JSON.stringify(JourneyStore.snapshot()));
  await page.locator('#ml-goal-amount').fill('5,0');await page.locator('#ml-goal-months').fill('0');
  await page.locator('#ml-save-goal').click();
  assert.equal(await page.locator('#ml-goal-amount-error').isVisible(),true);
  assert.equal(await page.locator('#ml-goal-months-error').isVisible(),true);
  assert.equal(await page.locator('#ml-goal-amount').getAttribute('aria-invalid'),'true');
  assert.equal(await page.locator('#toast').isVisible(),false,'field errors do not obscure the form');
  assert.equal(await page.locator('#ml-goal-amount').evaluate(e=>e===document.activeElement),true);
  assert.equal(await page.evaluate(()=>JSON.stringify(JourneyStore.snapshot())),before);
  await page.locator('#ml-goal-amount').fill('50,000,000');await page.locator('#ml-goal-months').fill('36');
  await page.locator('#ml-goal-months').press('Enter');
  assert.equal(await page.locator('#ml-goal-amount-error').isVisible(),false);
  assert.equal(await page.locator('#ml-goal-months-error').isVisible(),false);
  assert.deepEqual(await page.evaluate(()=>[JourneyStore.current.start.target,JourneyStore.current.goalMonths,JourneyStore.current.month]),[5000,36,0]);
});

test('설정은 Enter로 다음 달부터 한 번만 적용하고 같은 값은 중복 기록하지 않는다',{timeout:30000},async t=>{
  const page=await open(t);
  await page.locator('#ml-mobile-toggle').click();await page.locator('#ml-main-nav [data-page="settings"]').click();
  assert.equal(await page.locator('#ml-apply-settings').isDisabled(),true);
  const count=await page.evaluate(()=>JourneyStore.current.mods.length);
  await page.locator('#ml-setting-saving').fill('900000');await page.locator('#ml-setting-saving').press('Enter');
  assert.deepEqual(await page.evaluate(()=>[JourneyStore.current.saving,JourneyStore.current.mods.length,JourneyStore.current.mods.at(-1).m]),[90,count+1,1]);
  assert.equal(await page.locator('#ml-apply-settings').isDisabled(),true);
  assert.match(await page.locator('#settings-change-receipt').innerText(),/2026년 11월부터 적용/);
  assert.match(await page.locator('#settings-change-receipt').innerText(),/70만 원 → 90만 원/);
  await page.locator('#ml-settings-form').evaluate(e=>e.requestSubmit());
  assert.equal(await page.evaluate(()=>JourneyStore.current.mods.length),count+1);
});

test('새 여정 확인에서 취소하면 진행 기록과 입력 초안을 유지하고 적자를 안내한다',{timeout:30000},async t=>{
  const page=await open(t);
  await page.evaluate(()=>{JourneyStore.set('month',4);render();});
  await page.locator('.play-header-tools [data-page="finance"]').click();
  await page.locator('#ml-income').fill('1000000');await page.locator('#ml-expense').fill('2000000');
  assert.equal(await page.locator('#ml-cashflow-hint').isVisible(),true);
  assert.match(await page.locator('#ml-cashflow-hint').innerText(),/100만/);
  const before=await page.evaluate(()=>JSON.stringify(JourneyStore.snapshot()));
  await page.locator('#ml-finance-form button[type="submit"]').click();
  await page.getByRole('button',{name:'입력으로 돌아가기',exact:true}).click();
  assert.equal(await page.evaluate(()=>JSON.stringify(JourneyStore.snapshot())),before);
  assert.equal(await page.locator('#ml-income').inputValue(),'1,000,000');
  assert.equal(await page.locator('#ml-page-finance').isVisible(),true);
});

test('목표 초안은 마을에서 시간을 진행해도 유지하고 저장 전 목표를 바꾸지 않는다',{timeout:30000},async t=>{
  const page=await open(t);
  await page.locator('#ml-mobile-toggle').click();await page.locator('#ml-main-nav [data-page="goal"]').click();
  const target=await page.evaluate(()=>JourneyStore.current.start.target);
  await page.locator('#ml-goal-name').fill('나의 여행');await page.locator('#ml-goal-amount').fill('80,000,000');await page.locator('#ml-goal-months').fill('48');
  assert.equal(await page.locator('#goal-save-state').innerText(),'저장 전 변경');
  await page.locator('#ml-page-goal .experience-back').click();await page.locator('#ml-one-month').click();
  await page.locator('#ml-mobile-toggle').click();await page.locator('#ml-main-nav [data-page="goal"]').click();
  assert.equal(await page.locator('#ml-goal-amount').inputValue(),'80,000,000');
  assert.equal(await page.locator('#ml-goal-name').inputValue(),'나의 여행');
  assert.equal(await page.evaluate(()=>JourneyStore.current.start.target),target);
  await page.locator('#ml-save-goal').click();
  assert.deepEqual(await page.evaluate(()=>[JourneyStore.current.start.target,JourneyStore.current.goalMonths,JourneyStore.current.month]),[8000,48,1]);
  assert.equal(await page.locator('#goal-save-state').innerText(),'저장됨');
});

test('원 입력은 쉼표와 커서를 유지하며 잘못된 금액을 적용하지 않는다',{timeout:30000},async t=>{
  const page=await open(t);
  await page.locator('.play-header-tools [data-page="finance"]').click();
  const income=page.locator('#ml-income');
  await income.fill('');await income.pressSequentially('3456789');
  assert.equal(await income.inputValue(),'3,456,789');
  assert.equal(await income.evaluate(e=>e.selectionStart),9);
  assert.match(await page.locator('#ml-income-readable').innerText(),/345만 6,789원/);
  await income.fill('5,0');
  assert.equal(await income.inputValue(),'5,0');
  assert.equal(await income.evaluate(e=>e.validity.valid),false);
  const before=await page.evaluate(()=>JSON.stringify(JourneyStore.snapshot()));
  await page.locator('#ml-finance-form button[type="submit"]').click();
  assert.equal(await page.evaluate(()=>JSON.stringify(JourneyStore.snapshot())),before);
  await income.fill('3456789');
  await page.locator('#ml-finance-form button[type="submit"]').click();
  assert.equal(await page.evaluate(()=>JourneyStore.current.start.income),345.6789);
});
