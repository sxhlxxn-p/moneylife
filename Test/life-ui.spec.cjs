// Real browser interaction with explicit event API fixtures (no backend required).
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const {existsSync} = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const catalog = require('../Shared/life-events.json');
const root = path.resolve(__dirname, '..');
const url = `http://127.0.0.1:${process.env.LIFE_UI_PORT || 5190}`;
let browser, server;
before(async () => {
  server = spawn(process.execPath, ['scripts/dev-server.cjs'], {cwd:root, env:{...process.env,PORT:new URL(url).port},stdio:'ignore'});
  for (let i=0;i<100;i++) {
    try {if ((await fetch(url)).ok) break;} catch {}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  const chrome = process.env.UI_BROWSER_PATH || (process.platform==='win32' && existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe') ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined);
  browser = await chromium.launch({headless:true,...(chrome ? {executablePath:chrome} : {})});
});
after(async () => {
  await browser?.close();
  if (server && server.exitCode===null) await new Promise(resolve=>{server.once('exit',resolve);server.kill();});
});
async function open(t, viewport={width:1440,height:1000}, motion='reduce') {
  const context = await browser.newContext({viewport,reducedMotion:motion});
  t.after(()=>context.close());
  const page = await context.newPage();
  await page.route('https://fonts.googleapis.com/**',route=>route.abort());
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  t.after(()=>assert.deepEqual(errors,[],'No browser runtime errors'));
  await page.goto(url);
  await page.getByRole('button',{name:'예시 인생으로 시작 →',exact:true}).click();
  await page.waitForFunction(()=>LifeAnimation.snapshot().ready);
  return page;
}
async function shot(page, name) {
  if (!process.env.LIFE_UI_SCREENSHOTS) return;
  await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:path.join(process.env.LIFE_UI_SCREENSHOTS,name+'.png'),fullPage:!(await page.locator('#overlay').isVisible())});
}
test('메뉴·픽셀 캐릭터·상세 도구·진행 중 멈춤과 이어하기', {timeout:30000}, async t => {
  const page = await open(t, {width:1440,height:1000}, 'no-preference');
  assert.equal(await page.locator('#ml-main-nav').isVisible(),true);
  assert.equal(await page.locator('.life-character').innerText(),'픽셀 플레이어');
  assert.equal(await page.locator('#ml-user-avatar svg').count(),1);
  assert.equal(await page.evaluate(()=>LifeAnimation.snapshot().characterStyle),'pixel');
  assert.equal(await page.locator('#ml-game-chart').isVisible(),false);
  assert.equal(await page.locator('#ask').isVisible(),false);
  await shot(page,'moneylife-play-desktop');
  await page.locator('#life-details > summary').click();
  assert.equal(await page.locator('#ml-game-chart').isVisible(),true);
  assert.equal(await page.locator('#ask').isVisible(),true);
  await page.locator('#life-details > summary').click();
  await page.locator('#ml-next-event').click();
  await page.waitForFunction(()=>JourneyStore.current.month>=1);
  assert.equal(await page.evaluate(()=>LifeAnimation.snapshot().moving),true);
  await page.waitForFunction(()=>LifeAnimation.snapshot().groundOffset>0);
  const movingLayers = await page.evaluate(()=>LifeAnimation.snapshot());
  assert.equal(movingLayers.sceneryOffset,movingLayers.groundOffset);
  assert.ok(movingLayers.backgroundOffset>0 && movingLayers.backgroundOffset<movingLayers.groundOffset);
  await page.locator('#life-pause').click();
  const month = await page.evaluate(()=>JourneyStore.current.month);
  assert.ok(month>0 && month<12);
  assert.equal(await page.evaluate(()=>JourneyStore.current.timer),null);
  assert.equal(await page.evaluate(()=>LifeAnimation.snapshot().moving),false);
  await page.reload();
  await page.getByRole('button',{name:'내 이야기 이어하기 →',exact:true}).click();
  assert.equal(await page.evaluate(()=>JourneyStore.current.month),month);
  await page.locator('#ml-main-nav [data-page=finance]').click();
  assert.equal(await page.locator('.life-form-chapter').count(),3);
  const avatar = await page.evaluate(()=>JourneyStore.current.start.avatar);
  await page.locator('#ml-finance-form button[type=submit]').click();
  await page.locator('#confirmjourney').click();
  assert.equal(await page.evaluate(()=>JourneyStore.current.start.avatar),avatar);
  assert.equal(await page.evaluate(()=>JourneyStore.current.month),0);
  await page.evaluate(()=>{
    const state=JourneyStore.snapshot(); state.initial.name='보관한 여정';state.month=6;
    restoreServerPlan({id:'restored-fixture',schemaVersion:1,goalBasis:'net_assets',state});
  });
  assert.equal(await page.evaluate(()=>JourneyStore.current.month),6);
  assert.equal(await page.locator('#ml-user-name').innerText(),'보관한 여정');
});
test('배속과 재생이 같은 줄에 유지되고 재생 중 속도를 바꿔도 선택에서 멈춤', {timeout:30000}, async t => {
  const page = await open(t);
  for (const width of [320,390,768,1440]) {
    await page.setViewportSize({width,height:1000});
    const speed = await page.locator('.life-speed-control').boundingBox();
    const play = await page.locator('#ml-next-event').boundingBox();
    assert.ok(Math.abs(speed.y+speed.height/2-play.y-play.height/2)<2);
    assert.ok(speed.x+speed.width<=play.x);
    assert.ok(play.x+play.width<=width);
  }
  await page.evaluate(()=>{
    const original=window.setInterval;
    window.setInterval=(callback,delay,...args)=>{
      window.lastPlaybackDelay=delay;
      return original(callback,delay,...args);
    };
  });
  await page.getByRole('button',{name:'4배속',exact:true}).click();
  await page.locator('#ml-next-event').click();
  assert.equal(await page.evaluate(()=>window.lastPlaybackDelay),45);
  await page.getByRole('button',{name:'12배속',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.lastPlaybackDelay),15);
  assert.equal(await page.getByRole('button',{name:'12배속',exact:true}).getAttribute('aria-pressed'),'true');
  await page.waitForFunction(()=>JourneyStore.current.month===12 && !JourneyStore.current.timer);
  assert.equal(await page.getByRole('button',{name:catalog.events[0].a,exact:true}).isVisible(),true);
});

test('패널 안쪽 스크롤·고정 닫기·배경 스크롤 잠금과 초점 복원', {timeout:30000}, async t => {
  const page=await open(t,{width:375,height:667});
  for(const [width,height] of [[375,667],[390,844],[1440,900]]){
    await page.setViewportSize({width,height});
    await page.locator('#life-details > summary').click();
    const contained=await page.locator('#life-details').evaluate(panel=>{
      const body=panel.querySelector('.life-panel-scroll'),outer=panel.getBoundingClientRect(),inner=body.getBoundingClientRect();
      return inner.left>outer.left&&inner.right<outer.right&&inner.bottom<outer.bottom&&getComputedStyle(panel).overflowY==='hidden';
    });
    assert.equal(contained,true,`${width}px scroll track stays inside panel border`);
    await page.locator('#life-details .life-panel-scroll').hover();
    await page.mouse.wheel(0,300);
    await page.waitForFunction(()=>document.querySelector('#life-details .life-panel-scroll').scrollTop>0);
    await page.locator('#life-details > summary').click();
  }
  await page.setViewportSize({width:375,height:667});
  await page.locator('#life-details > summary').click();
  await page.locator('#life-open-archive').click();
  await page.waitForFunction(()=>document.getElementById('life-archive').open&&!document.getElementById('life-details').open);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#life-archive').evaluate(e=>e.open),false,'Escape closes the front panel');
  await page.locator('#ml-next-event').focus();
  await page.evaluate(()=>{
    JourneyStore.set('logs',Array.from({length:80},(_,month)=>({month,text:'일상을 기록했어요.'})));
    showLifeJournal();
  });
  await page.locator('.life-result-details > summary').click();
  const closeBefore=await page.getByRole('button',{name:'닫기',exact:true}).boundingBox();
  await page.locator('.modal-scroll').hover();
  await page.mouse.wheel(0,500);
  await page.waitForFunction(()=>document.querySelector('.modal-scroll').scrollTop>0);
  assert.deepEqual(await page.getByRole('button',{name:'닫기',exact:true}).boundingBox(),closeBefore,'close stays visible while contents scroll');
  assert.equal(await page.locator('#modal').evaluate(e=>e.scrollTop),0,'outer shell never scrolls');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).overflowY),'hidden');
  await page.evaluate(()=>showLifeEnding());
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#ml-next-event').evaluate(e=>e===document.activeElement),true,'replacing a popup preserves the original trigger');
});

test('다섯 이벤트의 선택과 설명이 스크롤 없이 한 화면에 표시됨', {timeout:30000}, async t => {
  const page=await open(t);
  for(const [width,height] of [[1366,768],[1024,600],[768,1024],[390,844],[375,667],[320,740]]){
    await page.setViewportSize({width,height});
    for(const event of catalog.events){
      await page.evaluate(month=>{closeModal();JourneyStore.set('month',month);render();eventPreview(month);},event.month);
      const size=await page.locator('.modal-scroll').evaluate(e=>({height:e.clientHeight,content:e.scrollHeight,width:e.clientWidth,contentWidth:e.scrollWidth}));
      assert.ok(size.content<=size.height+1,`${width}x${height} event ${event.month} fits vertically`);
      assert.ok(size.contentWidth<=size.width+1,`${width}px event ${event.month} fits horizontally`);
      for(const button of await page.locator('.eventoptions .choice').all()){
        const rect=await button.boundingBox();
        assert.ok(rect.y>=0&&rect.y+rect.height<=height,'both decisions stay inside viewport');
      }
    }
  }
});

test('팝업 내용·비동기 목록·창 크기에 맞춰 폭과 카드 열 수가 자동 조절됨', {timeout:30000}, async t => {
  const page=await open(t,{width:1366,height:768});
  await page.evaluate(()=>show('<h2>짧은 안내</h2><p>현재 여정은 그대로 이어갈 수 있어요.</p>'));
  await page.waitForTimeout(100);
  const compact=(await page.locator('#modal').boundingBox()).width;
  await page.evaluate(()=>{
    show('<h2>여정 안내</h2><div id="expanding-explanation"></div>');
    const host=document.getElementById('expanding-explanation');
    for(let i=0;i<6;i++){
      const line=document.createElement('p');
      line.textContent='오늘의 작은 선택이 미래의 생활과 목표를 바꾸어 갑니다. '.repeat(6);
      host.append(line);
    }
  });
  await page.waitForFunction(()=>{const shell=document.getElementById('modal'),body=shell.querySelector('.modal-scroll');return shell.getBoundingClientRect().width>700&&body.scrollHeight<=body.clientHeight+1;});
  await page.evaluate(()=>{
    JourneyStore.set('events',new Set([12,30,48,72,96]));
    showLifeJournal();
  });
  await page.waitForFunction(()=>document.querySelector('#modal').getBoundingClientRect().width>700);
  assert.ok((await page.locator('#modal').boundingBox()).width>compact);
  const memories=await page.locator('.life-memory-list article').all();
  const first=await memories[0].boundingBox(),second=await memories[1].boundingBox();
  assert.equal(first.y,second.y,'memories share a row when there is room');
  assert.equal(await page.locator('.modal-scroll').evaluate(e=>e.scrollHeight>e.clientHeight+1),false,'album fits without vertical scrolling');
  await page.route('**/api/plans?*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(Array.from({length:6},(_,i)=>({id:'fixture-'+i,name:'보관한 여정 '+i,month:i,createdAt:1730000000})))}));
  await page.evaluate(()=>openServerPlans());
  await page.waitForFunction(()=>document.querySelectorAll('.saved-plan').length===6);
  await page.waitForTimeout(100);
  const plans=await page.locator('.saved-plan').all();
  assert.equal((await plans[0].boundingBox()).y,(await plans[1].boundingBox()).y,'loaded plans automatically use two columns');
  await page.setViewportSize({width:375,height:667});
  await page.waitForTimeout(100);
  const modal=await page.locator('#modal').boundingBox();
  assert.ok(modal.width<=343&&modal.x>=16,'popup stays within mobile viewport');
  assert.equal((await plans[0].boundingBox()).x,(await plans[1].boundingBox()).x,'mobile plans return to one column');
});

test('선택 후 결과·재무 변화·엔딩도 넓은 창에서 스크롤 없이 확인', {timeout:30000}, async t => {
  const page=await open(t);
  for(const [width,height] of [[1366,768],[1024,600],[820,1180]]){
    await page.setViewportSize({width,height});
    for(const event of catalog.events){
      for(const accepted of [true,false]){
        await page.evaluate(({month,accepted})=>{closeModal();JourneyStore.set('month',month);render();showLifeResult(month,accepted,simulate());},{month:event.month,accepted});
        const modal=await page.locator('#modal').boundingBox();
        assert.ok(modal.width>=Math.min(1040,width-32)-1,'follow-up results stay as wide as decisions');
        assert.equal(await page.locator('.life-money-cards').isVisible(),true,'financial impact is visible immediately');
        assert.equal(await page.locator('.life-money-result summary').count(),0,'financial impact has no disclosure toggle');
        await page.waitForTimeout(35);
        const size=await page.locator('.modal-scroll').evaluate(e=>({height:e.clientHeight,content:e.scrollHeight,width:e.clientWidth,contentWidth:e.scrollWidth}));
        assert.ok(size.content<=size.height+1,`${width}x${height} result ${event.month}/${accepted} fits with financial details open`);
        assert.ok(size.contentWidth<=size.width+1);
      }
    }
    await page.evaluate(()=>{closeModal();JourneyStore.set('month',120);render();showLifeEnding();});
    await page.locator('.life-result-details > summary').click();
    await page.waitForTimeout(35);
    assert.equal(await page.locator('.modal-scroll').evaluate(e=>e.scrollHeight>e.clientHeight+1),false,`${width}px ending fits with comparison open`);
  }
  for(const [width,height] of [[375,667],[390,844],[320,740]]){
    await page.setViewportSize({width,height});
    for(const event of catalog.events){
      for(const accepted of [true,false]){
        await page.evaluate(({month,accepted})=>{closeModal();JourneyStore.set('month',month);render();showLifeResult(month,accepted,simulate());},{month:event.month,accepted});
        assert.equal(await page.locator('.modal-scroll').evaluate(e=>e.scrollHeight>e.clientHeight+1),false,`${width}px result ${event.month}/${accepted} fits before optional details`);
      }
    }
  }
});

test('선택 저장 실패 시 상태 보존·요청 복구·다중 클릭 방지', {timeout:30000}, async t => {
  const page = await open(t);
  let command;
  await page.route('**/api/event-branches',route=>{
    command=route.request().postDataJSON();
    return route.fulfill({status:503,contentType:'application/json',body:'{"detail":"API_UNAVAILABLE"}'});
  });
  await page.evaluate(()=>{playLifeStory();playLifeStory();});
  await page.getByRole('button',{name:catalog.events[0].a,exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('life-choice-status').textContent.includes('선택을 확인하지 못했어요'));
  assert.equal(await page.evaluate(()=>JourneyStore.current.month),12);
  assert.equal(await page.evaluate(()=>JourneyStore.current.events.size),0);
  assert.equal(await page.evaluate(()=>JourneyStore.current.mods.length),0);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('money-life-event-pending')).requestId),command.requestId);
  await page.getByRole('button',{name:'닫기',exact:true}).click();
  assert.equal(await page.locator('#eventrequest-retry').isVisible(),true);
  assert.equal(await page.locator('.life-scene').evaluate(node=>node.classList.contains('has-home')),false);
});
test('다섯 선택·정확한 일회성 비용·기억 앨범·120개월 엔딩과 복원', {timeout:45000}, async t => {
  const page = await open(t);
  const firstWaypoint = await page.locator('.life-waypoint').first().elementHandle();
  let calls=0;
  await page.route('**/api/event-branches',route=>{
    const command=route.request().postDataJSON();
    const state=structuredClone(command.base.state);
    const event=catalog.events.find(item=>item.month===command.eventMonth);
    // Accept independence only; the other four choices retain the current conditions.
    if(command.accepted)state.changes.push(...event.rule.effects.map(effect=>({type:effect.type,v:effect.value,m:event.month+1,end:null})));
    state.events.push(event.month);
    state.logs.unshift({month:event.month,text:command.accepted?event.a:event.b});
    calls++;
    return route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({plan:{id:`fixture-${event.month}`,schemaVersion:1,goalBasis:'net_assets',state}})});
  });
  for(const [index,event] of catalog.events.entries()){
    await page.locator('#ml-next-event').click();
    await page.getByRole('button',{name:index===0?event.a:event.b,exact:true}).click();
    await page.waitForFunction(()=>document.getElementById('modal').textContent.includes('선택을 반영했어요'));
    assert.equal(await page.evaluate(()=>JourneyStore.current.events.size),index+1);
    if(index===0){
      assert.equal(await page.locator('.life-scene').evaluate(node=>node.classList.contains('has-home')),true);
      assert.equal(await page.locator('.life-waypoint').first().innerText(),'');
      assert.equal(await firstWaypoint.evaluate(node=>node.isConnected),true,'progress dot remains mounted for its fill transition');
      await page.waitForFunction(()=>getComputedStyle(document.querySelector('.life-waypoint.completed')).backgroundColor==='rgb(100, 134, 185)');
      await shot(page,'moneylife-play-choice-result');
      assert.match(await page.locator('.life-money-cards > div').nth(1).innerText(),/490만 원/);
      assert.match(await page.locator('.life-money-cards > div').nth(1).innerText(),/선택 전 160만 원/);
      assert.match(await page.locator('.life-money-change').nth(0).innerText(),/−330만 원/);
      assert.match(await page.locator('.life-money-change').nth(1).innerText(),/\+330만 원/);
      assert.equal(await page.locator('.life-money-change').nth(0).evaluate(el=>getComputedStyle(el).color),'rgb(191, 59, 66)','decrease is red text');
      assert.equal(await page.locator('.life-money-change').nth(1).evaluate(el=>getComputedStyle(el).color),'rgb(36, 94, 179)','increase is blue text');
      assert.equal(await page.locator('.life-money-cards > div').nth(0).evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)','signed amount is emphasized on a neutral card');
    }
    await page.getByRole('button',{name:'다음 달로 이동 →',exact:true}).click();
    assert.equal(await page.evaluate(()=>JourneyStore.current.month),event.month+1);
  }
  await page.locator('#ml-next-event').click();
  await page.getByRole('button',{name:'선택 기록 돌아보기 →',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>JourneyStore.current.month),120);
  assert.equal(await page.locator('#ml-one-month').isDisabled(),true);
  await shot(page,'moneylife-play-ending');
  await page.getByRole('button',{name:'선택 기록 돌아보기 →',exact:true}).click();
  assert.equal(await page.locator('.life-memory-list article').count(),5);
  assert.equal(await page.locator('.life-memory-list article > span').first().innerText(),'01');
  assert.match(await page.locator('.life-memory-list').innerText(),/지금 독립할래요/);
  await page.reload();
  await page.getByRole('button',{name:'내 이야기 이어하기 →',exact:true}).click();
  assert.equal(await page.evaluate(()=>JourneyStore.current.month),120);
  assert.equal(await page.locator('.life-waypoint.completed').count(),5);
  assert.equal(calls,5);
});

test('모든 장면의 배경과 장식물 이동·멈춤·크기 변경·끊김 없는 반복', {timeout:30000}, async t => {
  const page=await open(t,{width:390,height:844},'no-preference');
  const scenes=[
    ['street',{phase:'start',month:0}],['housing',{phase:'home',month:12}],
    ['home',{phase:'home',month:13,home:true}],['park',{phase:'rest',month:31,rest:true}],
    ['office',{phase:'work',month:49}],['beach',{phase:'travel',month:73,travel:true}],
    ['classroom',{phase:'learn',month:97,learn:true}],['sunset',{phase:'end',month:120}],
  ];
  for(const [location,state] of scenes){
    await page.evaluate(state=>LifeAnimation.sync({...state,moving:true}),state);
    await page.waitForFunction(()=>LifeAnimation.snapshot().sceneryOffset>12);
    const moving=await page.evaluate(()=>LifeAnimation.snapshot());
    assert.equal(moving.location,location);
    assert.equal(moving.sceneryOffset,moving.groundOffset,location+' props follow the floor');
    assert.equal(moving.backgroundOffset,moving.groundOffset*.25,location+' distant layer moves slowly');
    await page.evaluate(()=>LifeAnimation.setMoving(false));
    const stopped=await page.evaluate(()=>LifeAnimation.snapshot());
    await page.waitForTimeout(100);
    const later=await page.evaluate(()=>LifeAnimation.snapshot());
    assert.equal(later.sceneryOffset,stopped.sceneryOffset,location+' props pause');
    assert.equal(later.backgroundOffset,stopped.backgroundOffset,location+' backdrop pauses');
  }
  const beforeResize=await page.evaluate(()=>LifeAnimation.snapshot());
  await page.setViewportSize({width:768,height:1024});
  await page.waitForTimeout(150);
  const afterResize=await page.evaluate(()=>LifeAnimation.snapshot());
  assert.equal(afterResize.sceneryOffset,beforeResize.sceneryOffset);
  assert.equal(afterResize.groundOffset,beforeResize.groundOffset);
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>LifeAnimation.sync({phase:'home',month:13,home:true,moving:true}));
  await page.waitForFunction(()=>{const s=LifeAnimation.snapshot();return s.sceneryOffset>s.sceneryPeriod+20},{},{timeout:12000});
  const wrapped=await page.evaluate(()=>LifeAnimation.snapshot());
  assert.equal(wrapped.sceneryOffset,wrapped.groundOffset,'scenery wraps as a texture without resetting its position');
  await page.evaluate(()=>LifeAnimation.setMoving(false));
});
test('320~1920px 화면·입력·상세 화면의 넘침과 장면 겹침', {timeout:30000}, async t => {
  const page=await open(t);
  for(const [width,height] of [[1366,768],[1440,900],[1920,1080],[1024,768],[820,1180],[768,1024],[390,844],[375,667],[320,740]]){
    await page.setViewportSize({width,height});
    await page.evaluate(()=>scrollTo(0,0));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${width}px scene`);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight+1),false,`${width}x${height} game fits without page scrolling`);
    for(const selector of ['#ml-next-event','.life-speed-control','#life-time-options > summary','#life-details > summary','.life-understage > button']){
      const control=await page.locator(selector).boundingBox();
      assert.ok(control.y>=0&&control.y+control.height<=height,`${width}x${height} ${selector} stays inside viewport`);
      assert.ok(control.height>=44,`${selector} remains touchable`);
    }
    if(width===1366){
      await page.evaluate(()=>scrollTo(0,0));
      const action=await page.locator('#ml-next-event').boundingBox();
      assert.ok(action.y+action.height<=height,'Laptop primary action is visible without scrolling');
    }
    assert.equal(await page.evaluate(()=>{const a=document.querySelector('.life-scene-title').getBoundingClientRect(),b=document.querySelector('.life-animation-frame').getBoundingClientRect();return a.left>=b.left&&a.right<=b.right&&a.bottom<=b.bottom;}),true,`${width}px story stays inside animation frame`);
    assert.equal(await page.locator('#life-animation canvas').count(),1);
    if(width===390)await shot(page,'moneylife-play-mobile');
    await page.locator('#life-details > summary').click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${width}px details`);
    await page.locator('#life-details > summary').click();
    if(!await page.locator('#ml-main-nav [data-page=finance]').isVisible())await page.locator('#ml-mobile-toggle').click();
    await page.locator('#ml-main-nav [data-page=finance]').click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${width}px finance`);
    if(width===1366)await shot(page,'moneylife-play-finance');
    if(!await page.locator('#ml-main-nav [data-page=dashboard]').isVisible())await page.locator('#ml-mobile-toggle').click();
    await page.locator('#ml-main-nav [data-page=dashboard]').click();
  }
  await page.evaluate(()=>{JourneyStore.set('start',{...JourneyStore.current.start,cash:0});render();});
  assert.equal(await page.locator('#life-warning').isVisible(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight+1),false,'cash warning fits without scrolling');
  await page.locator('#ml-mobile-toggle').click();
  assert.equal(await page.locator('#ml-main-nav').isVisible(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight+1),false,'menu overlays the game without moving controls');
  await page.locator('#ml-mobile-toggle').click();
  await page.locator('#life-time-options > summary').click();
  assert.equal(await page.locator('#ml-one-month').isVisible(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight+1),false,'time controls open inside viewport');
  await page.locator('#life-time-options > summary').click();
  await page.locator('.life-mobile-journal').click();
  assert.equal(await page.locator('#overlay').isVisible(),true);
});
