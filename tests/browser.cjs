const {chromium}=require('playwright');
const path=require('path'),fs=require('fs'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');
const shots=path.resolve(process.env.INTENT_SCREENSHOTS || 'test-results');fs.mkdirSync(shots,{recursive:true});

const directShortsFixture=`<!doctype html><meta charset="utf-8"><style>html{--yt-spec-base-background:#fff;--yt-spec-text-primary:#0f0f0f;--yt-spec-text-secondary:#606060}html[dark]{--yt-spec-base-background:#0f0f0f;--yt-spec-text-primary:#f1f1f1;--yt-spec-text-secondary:#aaa}body{margin:0;background:var(--yt-spec-base-background);color:var(--yt-spec-text-primary);font-family:Arial,sans-serif}ytd-masthead{position:fixed;top:0;left:0;right:0;z-index:2020;height:56px;display:flex;align-items:center;gap:20px;padding:0 20px;background:var(--yt-spec-base-background)}ytd-masthead #center{display:flex;align-items:center;flex:1;min-width:0}#search{display:flex;flex:1}#search input{width:100%;min-width:0}#logo{display:block;color:inherit;padding:10px;text-decoration:none}ytd-guide-renderer{display:block;position:fixed;left:0;top:56px;bottom:0;width:200px;background:var(--yt-spec-base-background);z-index:2010}ytd-guide-entry-renderer{display:block;padding:14px}ytd-guide-renderer a{color:inherit}ytd-page-manager{display:block;margin:56px 0 0 216px;padding:16px;min-height:calc(100vh - 56px)}ytd-shorts{display:block;height:700px;background:#97004f;color:white}video{width:300px;height:550px}</style><ytd-app><ytd-masthead><div id="start"><a id="logo" href="/">YouTube</a></div><div id="center"><form id="search"><input aria-label="Search"></form></div><div id="end">Account</div></ytd-masthead><ytd-guide-renderer><ytd-guide-entry-renderer><a id="guide-home" href="/">Home</a></ytd-guide-entry-renderer><ytd-guide-entry-renderer id="guide-shorts"><a href="/shorts/Q0000000000">Shorts</a></ytd-guide-entry-renderer><ytd-guide-entry-renderer id="guide-shorts-nohref" is-primary><a id="endpoint" role="link" title="Shorts" tabindex="-1"><tp-yt-paper-item role="link"><yt-formatted-string class="title">Shorts</yt-formatted-string></tp-yt-paper-item></a></ytd-guide-entry-renderer></ytd-guide-renderer><ytd-page-manager><ytd-shorts id="shorts-player"><video id="short-video"></video><h2>Native Shorts player</h2></ytd-shorts></ytd-page-manager></ytd-app><script>window.shortPauses=0;window.shortPlaying=true;window.shortsPlayer=document.querySelector('#short-video');Object.defineProperty(shortsPlayer,'paused',{get:()=>!shortPlaying});const nativePause=shortsPlayer.pause.bind(shortsPlayer);shortsPlayer.pause=()=>{shortPauses++;shortPlaying=false;nativePause();};</script>`;

// Exercise actual thumbnail visibility, including paint that overflows a glass pseudo-element.
async function installGlassFixture(page) {
 return page.evaluate(()=>{
  const style=document.createElement('style');style.id='glass-regression-style';
  style.textContent=`ytd-masthead{height:64px!important;position:relative!important;z-index:2000!important;background:#fff!important}.fixture-header,.top{display:none!important}#glass-regression-app #frosted-glass{position:fixed;top:8px;left:0;width:100%;height:160px;min-height:192px;z-index:1500;background:#000}#glass-regression-app #frosted-glass::after{content:'';position:absolute;left:0;right:0;bottom:-40px;height:40px;background:#000;pointer-events:auto}`;
  document.head.append(style);
  const app=document.createElement('ytd-app');app.id='glass-regression-app';
  app.innerHTML='<div id="content"><div class="deep-empty-shell"><div id="frosted-glass" class="modern-glass-without-chipbar"><div class="empty-inner-wrapper"></div></div></div></div>';
  document.body.append(app);window.scrollTo(0,0);
  const host=document.querySelector('#intent-home-feed'),cover=host.shadowRoot.querySelector('.cover'),rect=cover.getBoundingClientRect();
  const hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+2);
  return {initiallyCovered:hit===app.querySelector('#frosted-glass'),mastheadBottom:document.querySelector('ytd-masthead').getBoundingClientRect().bottom};
 });
}
async function assertFirstRowUncovered(page) {
 await page.waitForFunction(()=>{
  const glass=document.querySelector('#glass-regression-app #frosted-glass'),masthead=document.querySelector('ytd-masthead');
  return glass&&glass.getBoundingClientRect().bottom<=masthead.getBoundingClientRect().bottom+.5;
 });
 const visibility=await page.evaluate(()=>{
  const host=document.querySelector('#intent-home-feed'),covers=[...host.shadowRoot.querySelectorAll('.first-grid .cover')],top=covers[0].getBoundingClientRect().top;
  const mastheadBottom=document.querySelector('ytd-masthead').getBoundingClientRect().bottom;
  return covers.filter(cover=>Math.abs(cover.getBoundingClientRect().top-top)<1).map(cover=>{
   const rect=cover.getBoundingClientRect(),x=rect.x+rect.width/2,y=rect.y+2;
   const outer=document.elementFromPoint(x,y),inner=host.shadowRoot.elementFromPoint(x,y);
   return {belowMasthead:rect.top>=mastheadBottom,uncovered:outer===host&&cover.contains(inner),hit:outer?.id||outer?.tagName};
  });
 });
 assert.ok(visibility.length>=3,'the regression checks the complete first thumbnail row');
 assert.ok(visibility.every(item=>item.belowMasthead&&item.uncovered),'every thumbnail top must receive the hit rather than opaque native glass: '+JSON.stringify(visibility));
}
async function assertGlassRestored(page) {
 const native=await page.locator('#glass-regression-app #frosted-glass').evaluate(el=>({height:el.getBoundingClientRect().height,minHeight:getComputedStyle(el).minHeight,pseudoHeight:getComputedStyle(el,'::after').height,overflow:getComputedStyle(el).overflow,owned:el.hasAttribute('data-intent-home-glass'),variable:el.style.getPropertyValue('--intent-masthead-glass-height')}));
 assert.deepEqual(native,{height:192,minHeight:'192px',pseudoHeight:'40px',overflow:'visible',owned:false,variable:''},'Off/Pause restore native glass and generated paint');
 assert.equal(await page.locator('ytd-masthead').evaluate(el=>el.getBoundingClientRect().bottom),64,'the native masthead is never moved');
}
async function removeGlassFixture(page) {
 await page.evaluate(()=>{document.querySelector('#glass-regression-app').remove();document.querySelector('#glass-regression-style').remove();});
}

async function expandAdvanced(page) {
 const advanced=page.locator('#intent-editor details.intent-advanced');
 if(await advanced.count()&&await advanced.getAttribute('open')===null)await advanced.locator('summary').click();
}

async function chooseMode(toolbar, mode, customName) {
 const names={work:'Work',study:'Study',music:'Music',off:'Off'};
 await toolbar.getByRole('combobox',{name:'Intent mode',exact:true}).click();
 await toolbar.getByRole('option',{name:customName||names[mode],exact:true}).click();
 if(mode==='off')return;
 await toolbar.getByRole('combobox',{name:'Intent mode',exact:true}).evaluate((el,mode)=>new Promise(resolve=>{const poll=()=>el.dataset.mode===mode?resolve():setTimeout(poll,10);poll();}),mode);
}
(async()=>{
 const b=await chromium.launch({channel:'chromium',headless:true});const errors=[];
 try{
  const context=await b.newContext({viewport:{width:1660,height:1100}});context.setDefaultTimeout(10000);
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto('file://'+root+'/settings.html');
  await page.getByRole('heading',{name:'What are you here for?'}).waitFor();
  assert.equal(await page.getByRole('heading',{name:'Make it yours',exact:true}).count(),0);
  // Arrange the actual intent cards, using pointer drag and the handle's keyboard controls.
  const expectOrder=async expected=>{await page.waitForFunction(expected=>JSON.stringify(JSON.parse(localStorage.getItem('intent-demo')).intentOrder)===JSON.stringify(expected),expected);assert.deepEqual(await page.locator('[data-order-intent]').evaluateAll(cards=>cards.map(card=>card.dataset.orderIntent)),expected);};
  await page.locator('[data-drag-intent="study"]').dragTo(page.locator('[data-order-intent="work"]'));
  await expectOrder(['study','work','music']);
  assert.equal(await page.locator('[data-mode="work"]').getAttribute('aria-pressed'),'true','reordering does not select a different intent');
  for(const [key,order]of [['ArrowRight',['work','study','music']],['ArrowDown',['work','music','study']],['ArrowUp',['work','study','music']],['ArrowLeft',['study','work','music']],['End',['work','music','study']],['Home',['study','work','music']]]){
   await page.locator('[data-drag-intent="study"]').press(key);await expectOrder(order);
  }
  await page.reload();await page.locator('[data-drag-intent="study"]').waitFor();await expectOrder(['study','work','music']);
  await page.locator('[data-drag-intent="work"]').press('Home');await expectOrder(['work','study','music']);
  assert.equal(await page.locator('#intent-order').count(),0,'there is no separate arrangement list below the intent cards');
  await page.locator('[data-edit="music"]').click();
  assert.equal(await page.locator('[data-mode="work"]').getAttribute('aria-pressed'),'true','editing another intent does not change the selected mode');
  await expandAdvanced(page);
  await page.locator('#topics').fill('sitar, tabla');
  await page.locator('#channels').fill('My Channel');
  await page.getByRole('button',{name:'Save preferences'}).click();await page.getByText('All preferences saved on this device.').waitFor();
  await page.locator('#close-editor').click();await page.reload();
  await page.locator('[data-edit="music"]').click();
  await expandAdvanced(page);
  assert.equal(await page.locator('#topics').inputValue(),'sitar, tabla');
  assert.equal(await page.locator('#channels').inputValue(),'My Channel');
  await page.locator('#close-editor').click();await page.locator('[data-edit="study"]').click();
  await expandAdvanced(page);
  await page.locator('#topics').fill('Astronomie');
  await page.getByRole('button',{name:'Save preferences'}).click();await page.getByText('All preferences saved on this device.').waitFor();
  await page.locator('#close-editor').click();
  // Creating and editing use one consistent dialog, including icon, channel and timer rules.
  assert.equal(await page.locator('#custom-intent-name,#custom-intent-description').count(),0,'there is no separate inline creation form');
  await page.getByRole('button',{name:'Create your own intent',exact:true}).click();
  await page.locator('#intent-editor[open]').waitFor();
  await page.locator('#intent-name').fill('Chess practice');
  await page.locator('#intent-description').fill('Chess endgame training: king and pawn endings, rook endgames and checkmates.');
  await page.locator('#intent-icon').selectOption('game');
  await page.locator('#channels').fill('Board Academy');
  await page.locator('#intent-count-time').uncheck();
  await expandAdvanced(page);await page.locator('#topics').fill('rook endings');
  await page.getByRole('button',{name:'Create intent',exact:true}).click();
  await page.locator('#intent-editor[open]').waitFor({state:'detached'});
  const created=await page.evaluate(()=>{const saved=JSON.parse(localStorage.getItem('intent-demo'));return Object.keys(saved.customIntents).find(id=>saved.customIntents[id].name==='Chess practice');});
  assert.ok(created);await page.locator(`[data-edit="${created}"]`).click();
  assert.equal(await page.locator('#intent-name').inputValue(),'Chess practice');
  assert.equal(await page.locator('#intent-description').inputValue(),'Chess endgame training: king and pawn endings, rook endgames and checkmates.');
  assert.equal(await page.locator('#intent-icon').inputValue(),'game');
  assert.equal(await page.locator('#channels').inputValue(),'Board Academy');
  assert.equal(await page.locator('#intent-count-time').isChecked(),false);
  await expandAdvanced(page);assert.equal(await page.locator('#topics').inputValue(),'rook endings');
  await page.locator('#close-editor').click();
  await page.getByRole('switch',{name:'Hide Shorts',exact:true}).click();
  assert.equal(await page.getByRole('switch',{name:'Hide Shorts',exact:true}).getAttribute('aria-checked'),'false');
  await page.getByRole('switch',{name:'Hide Shorts',exact:true}).click();
  await page.getByRole('button',{name:'Work Get in the zone'}).click();
  await page.getByRole('button',{name:'Show filtered examples'}).click();
  assert.ok(await page.locator('.sample-card.filtered').count()>0);
  await page.getByRole('button',{name:'Hide filtered examples'}).click();
  await page.screenshot({path:path.join(shots,'intent-settings.png'),fullPage:true});
  const settingsLight=await page.locator('html').evaluate(el=>getComputedStyle(el).backgroundColor);
  await page.emulateMedia({colorScheme:'dark'});
  const settingsDark=await page.locator('html').evaluate(el=>getComputedStyle(el).backgroundColor);
  assert.notEqual(settingsLight,settingsDark,'settings follow system dark mode');
  await page.screenshot({path:path.join(shots,'intent-settings-dark.png'),fullPage:true});
  await page.locator('[data-edit="work"]').click();await page.screenshot({path:path.join(shots,'intent-editor-dark.png')});await page.keyboard.press('Escape');
  await page.emulateMedia({colorScheme:'light'});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const popup=await context.newPage();await popup.setViewportSize({width:400,height:850});
  await popup.goto('file://'+root+'/popup.html');await popup.getByRole('heading',{name:'Your daily budget'}).waitFor();
  assert.equal(await popup.locator('a.all-settings').count(),1,'the popup has one clear Settings link');
  await popup.screenshot({path:path.join(shots,'intent-popup.png'),fullPage:true});
  const yt=await context.newPage();yt.on('pageerror',e=>errors.push(e.message));
  await yt.route('https://www.youtube.com/**',route=>route.fulfill({contentType:'text/html',body:`<!DOCTYPE html><html lang="en-GB"><head><meta charset="utf-8"><script>var ytcfg={set:function(value){this.data_=value}};ytcfg.set({"INNERTUBE_CONTEXT":{"client":{"hl":"en-GB","gl":"DE"}}});</script><style>:root{--yt-spec-base-background:#fff;--yt-spec-text-primary:#0f0f0f;--yt-spec-text-secondary:#606060}html[dark]{--yt-spec-base-background:#0f0f0f;--yt-spec-text-primary:#f1f1f1;--yt-spec-text-secondary:#aaa}body{margin:0;background:var(--yt-spec-base-background);color:var(--yt-spec-text-primary);font-family:Arial,sans-serif}.fixture-header{padding:18px 30px;border-bottom:1px solid #dfe2d7;font-weight:600;display:flex;justify-content:space-between}.fixture-header small{font-weight:400;color:#778073}ytd-masthead{display:flex;height:56px;padding:0 16px;align-items:center;gap:24px}ytd-masthead #start{flex:0 0 169px}ytd-masthead #end{flex:0 0 80px}ytd-masthead #center{display:flex;align-items:center;flex:1;max-width:728px;margin-inline:auto;min-width:0;gap:8px}@media(max-width:700px){ytd-masthead #start{flex-basis:auto}ytd-masthead #end{flex-basis:auto}}#search{display:flex;flex:1;max-width:640px;min-width:0}#search input{min-width:0;width:100%;padding:8px;border-radius:20px}ytd-browse{display:block}#primary{width:100%;margin:0}ytd-rich-item-renderer{display:block}</style></head><body><ytd-masthead><div id="start">YouTube</div><div id="center"><form id="search"><input aria-label="Search" placeholder="Search"></form><button id="voice-search-button" aria-label="Search with your voice">Mic</button></div><div id="end">Account</div></ytd-masthead><div class="fixture-header">YouTube · Intent feed preview <small>Synthetic videos for automated checks</small></div><ytd-browse page-subtype="home"><div id="primary"><ytd-rich-item-renderer id="work"><h3 id="video-title">Python programming for useful tools</h3><div id="channel-name"><a>Code Notebook</a></div></ytd-rich-item-renderer><ytd-rich-item-renderer id="music"><h3 id="video-title">Quiet jazz for a slow afternoon</h3><div id="channel-name"><a>Sunday Sounds</a></div></ytd-rich-item-renderer><ytd-rich-item-renderer id="bait"><h3 id="video-title">You won't believe this music!!!</h3></ytd-rich-item-renderer><ytd-rich-item-renderer id="short"><h3 id="video-title">Music in 20 seconds</h3><a href="/shorts/abc">Short</a></ytd-rich-item-renderer><ytd-reel-shelf-renderer id="shelf"><h2>Shorts</h2><ytm-shorts-lockup-view-model id="native-short"><a href="/shorts/m0000000096"><h3>Quiet jazz music short</h3></a></ytm-shorts-lockup-view-model></ytd-reel-shelf-renderer></div></ytd-browse></body></html>`}));
  await yt.route('https://i.ytimg.com/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#d8dfc8"/><circle cx="490" cy="230" r="160" fill="#c0cdae"/><path d="M60 240h220M60 190h150" stroke="#718465" stroke-width="12" stroke-linecap="round"/></svg>'}));
  await yt.route('https://extension.test/icons/**',route=>route.fulfill({path:root+'/icons/128.png'}));
  await yt.goto('https://www.youtube.com/');
  const nativeSearchGeometry=await yt.evaluate(()=>Object.fromEntries(['ytd-masthead #center','#search','#search input','#voice-search-button'].map(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return[selector,{x:r.x,width:r.width}];})));
  const nativePrimary=await yt.locator('#primary').evaluate(el=>({width:el.getBoundingClientRect().width,margin:getComputedStyle(el).margin,padding:getComputedStyle(el).padding}));
  for (const file of ['core.js','feed.js','feed-theme.js','home.js','toolbar.js']) await yt.addScriptTag({path:root+'/src/'+file});
  await yt.evaluate(()=>{
    window.testSettings={...IntentCore.defaults(),mode:'music'};window.testPaused=false;window.testHandlers=[];window.testRequests=[];window.testFail=false;window.testDelayWork=false;
    const make=(mode,n)=>({id:mode[0]+String(n).padStart(10,'0'),title:mode==='work'?`Python programming lesson ${n+1}`:mode==='study'?`Physics lecture ${n+1}`:`Quiet jazz music ${n+1}`,channel:'Studio North',description:'',duration:'12:40',metadata:'3.9M views · 2 years ago',thumbnail:'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg',shorts:false});
    window.chrome={runtime:{id:'test',getURL:s=>'https://extension.test/'+s,onMessage:{addListener:fn=>testHandlers.push(fn)},sendMessage:async message=>{
      if(message.type==='SET_MODE'){testSettings.mode=message.mode;testHandlers.forEach(f=>f({type:'SETTINGS',settings:testSettings}));}
      if(message.type!=='GET_FEED')return {ok:true,settings:testSettings,tabPaused:testPaused,blocked:false};
      testRequests.push(message);const settings=structuredClone(testSettings);
      if(testFail)return {ok:false,error:'YouTube search unavailable'};
      if(settings.mode==='work'&&testDelayWork)await new Promise(resolve=>setTimeout(resolve,300));
      const videos=Array.from({length:12},(_,n)=>make(settings.mode,n+message.cursor*12));
      return {ok:true,key:message.key,items:[...videos,videos[0],{...make('work',99),title:'You won’t believe this Python music!!!'},{...make('work',98),title:'Cooking recipe'},...Array.from({length:8},(_,n)=>({...make('music',90+n),shorts:true}))],nextCursor:message.cursor+2,hasMore:message.cursor<2,warning:'',metadataStats:{limit:settings.metadataLimit,checked:4,requests:2,cacheHits:2,sharedRequests:0,failed:0,remaining:1}};
    }}};
    window.setTestMode=mode=>{testSettings.mode=mode;testHandlers.forEach(f=>f({type:'SETTINGS',settings:testSettings,tabPaused:testPaused}));};
    window.setTestPaused=paused=>{testPaused=paused;testHandlers.forEach(f=>f({type:'SETTINGS',settings:testSettings,tabPaused:testPaused}));};
  });
  await yt.addStyleTag({path:root+'/src/content.css'});await yt.addScriptTag({path:root+'/src/content.js'});
  await yt.waitForFunction(()=>document.querySelector('#intent-home-feed')?.shadowRoot.querySelectorAll('.card').length===12);
  assert.equal(await yt.locator('#work').isVisible(),false);
  assert.equal(await yt.locator('#music').isVisible(),false,'the native feed is replaced, not left with gaps');
  const feed=yt.locator('#intent-home-feed'),toolbar=yt.locator('#intent-toolbar');
  await toolbar.waitFor();
  assert.equal(await toolbar.locator('svg.logo').count(),1);assert.equal(await toolbar.locator('.logo').evaluate(el=>el.getAttribute('viewBox')==='0 0 128 128'&&!el.hasAttribute('src')&&!el.querySelector('[href],[src]')),true,'the original brand uses inline geometry without cross-origin image loads');
  assert.equal(await yt.locator('ytd-masthead #center #intent-toolbar').count(),0,'Intent does not consume native search layout space');
  assert.deepEqual(await yt.evaluate(()=>Object.fromEntries(['ytd-masthead #center','#search','#search input','#voice-search-button'].map(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return[selector,{x:r.x,width:r.width}];}))),nativeSearchGeometry,'the native search, input and microphone retain their original position and width');
  assert.equal(await yt.evaluate(()=>{const toolbar=document.querySelector('#intent-toolbar'),search=document.querySelector('#search'),start=document.querySelector('ytd-masthead #start'),mic=document.querySelector('#voice-search-button'),r=toolbar.getBoundingClientRect();return search.nextElementSibling===mic&&r.width>0&&r.left>=start.getBoundingClientRect().right&&r.right<=search.getBoundingClientRect().left;}),true,'Intent uses the available gap after the logo while native search and microphone remain grouped');
  assert.equal(await feed.locator('header').isVisible(),false,'there is no separate intent banner above the feed');
  const homeGeometry=await feed.evaluate(el=>{const r=el.getBoundingClientRect(),p=el.parentElement.getBoundingClientRect();return{left:r.left-p.left,right:p.right-r.right,maxWidth:getComputedStyle(el).maxWidth};});
  assert.ok(Math.abs(homeGeometry.left)<2&&Math.abs(homeGeometry.right)<2,'home feed uses the full native content width without centered side bars');
  assert.equal(homeGeometry.maxWidth,'none');
  assert.equal(await feed.locator('.card').count(),12);
  assert.match(await feed.locator('.status').textContent(),/2 extra video-page requests/);
  assert.ok((await feed.locator('.title').allTextContents()).every(t=>t.includes('jazz music')));
  assert.equal(await feed.locator('.meta').first().innerText(),'3.9M views · 2 years ago','Home preserves the view-count format supplied for the selected YouTube language and region');
  assert.deepEqual(await yt.evaluate(()=>testRequests[0].locale),{hl:'en-GB',gl:'DE'},'the feed reads the native YouTube bootstrap language and region');
  const boxes=await feed.locator('.card').evaluateAll(cards=>cards.map(c=>{const r=c.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width};}));
  const firstRow=boxes.filter(r=>r.y===boxes[0].y);assert.ok(firstRow.length>=3);
  const gap=await feed.locator('.first-grid').evaluate(el=>parseFloat(getComputedStyle(el).columnGap));
  for(let i=1;i<firstRow.length;i++)assert.ok(Math.abs(firstRow[i].x-firstRow[i-1].x-firstRow[i-1].w-gap)<2,'cards compact without empty slots');
  const glassFixture=await installGlassFixture(yt);assert.deepEqual(glassFixture,{initiallyCovered:true,mastheadBottom:64},'the native deep glass fixture initially cuts across real thumbnail tops');
  await assertFirstRowUncovered(yt);
  await yt.screenshot({path:path.join(shots,'intent-home-glass-clear.png')});
  await yt.evaluate(()=>setTestMode('off'));await feed.waitFor({state:'detached'});await assertGlassRestored(yt);
  await yt.evaluate(()=>setTestMode('music'));await feed.locator('.cover').first().waitFor();await assertFirstRowUncovered(yt);
  await yt.evaluate(()=>setTestPaused(true));await feed.waitFor({state:'detached'});await assertGlassRestored(yt);
  await yt.evaluate(()=>setTestPaused(false));await feed.locator('.cover').first().waitFor();await assertFirstRowUncovered(yt);
  await removeGlassFixture(yt);
  await feed.getByRole('button',{name:'Find more videos'}).click();
  await yt.waitForFunction(()=>document.querySelector('#intent-home-feed').shadowRoot.querySelectorAll('.card').length===24);
  assert.equal(await feed.locator('.card').count(),24);
  assert.match(await feed.locator('.status').textContent(),/4 extra video-page requests/);
  await toolbar.getByRole('button',{name:'Refresh feed',exact:true}).click();
  await yt.waitForFunction(()=>document.querySelector('#intent-home-feed').shadowRoot.querySelectorAll('.card').length===12);
  assert.equal(await yt.evaluate(()=>testRequests.at(-1).round),1);
  assert.equal(await yt.evaluate(()=>testRequests.at(-1).fresh),true);
  // Shorts remain topic-filtered when the dedicated hide toggle is off.
  await yt.evaluate(()=>{testSettings.hideShorts=false;testHandlers.forEach(f=>f({type:'SETTINGS',settings:testSettings}));});
  await feed.locator('[data-video-id="m0000000097"]').waitFor();
  assert.equal(await feed.locator('[data-video-id="m0000000097"] .title').getAttribute('href'),'https://www.youtube.com/shorts/m0000000097');
  assert.equal(await feed.locator('.grid .shorts').count(),0,'portrait Shorts do not stretch rows of regular videos');
  assert.equal(await feed.locator('.shorts-shelf .shorts').count(),8,'allowed Shorts use a separate horizontal shelf');
  const shelfPosition=await feed.evaluate(host=>{const root=host.shadowRoot;return{firstBottom:root.querySelector('.first-grid').getBoundingClientRect().bottom,shortsTop:root.querySelector('.shorts-shelf').getBoundingClientRect().top,shortsBottom:root.querySelector('.shorts-shelf').getBoundingClientRect().bottom,restTop:root.querySelector('.rest-grid').getBoundingClientRect().top};});
  assert.equal(await feed.locator('.first-grid .card').count(),firstRow.length,'exactly one regular row comes before Shorts');
  assert.equal(await feed.locator('.rest-grid .card').count(),12-firstRow.length);
  assert.ok(shelfPosition.shortsTop>=shelfPosition.firstBottom&&shelfPosition.restTop>=shelfPosition.shortsBottom,'Shorts sit between the first regular row and the remaining videos');
  const previousShorts=feed.getByRole('button',{name:'Scroll Shorts left',exact:true}),nextShorts=feed.getByRole('button',{name:'Scroll Shorts right',exact:true});
  assert.equal(await previousShorts.isDisabled(),true);assert.equal(await nextShorts.isEnabled(),true);
  await nextShorts.click();await yt.waitForFunction(()=>document.querySelector('#intent-home-feed').shadowRoot.querySelector('.shorts-grid').scrollLeft>50);
  assert.equal(await previousShorts.isEnabled(),true,'right arrow actually scrolls the shelf');
  await previousShorts.click();await yt.waitForFunction(()=>document.querySelector('#intent-home-feed').shadowRoot.querySelector('.shorts-grid').scrollLeft<=1);
  await yt.setViewportSize({width:390,height:844});
  await yt.waitForFunction(()=>document.querySelector('#intent-home-feed').shadowRoot.querySelector('.first-grid').children.length===1);
  assert.equal(await yt.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Shorts overflow stays inside its scroller on mobile');
  const mobileShelf=await feed.evaluate(host=>{const root=host.shadowRoot;return{before:root.querySelector('.first-grid').getBoundingClientRect().bottom,shelf:root.querySelector('.shorts-shelf').getBoundingClientRect().top,after:root.querySelector('.rest-grid').getBoundingClientRect().top,end:root.querySelector('.shorts-shelf').getBoundingClientRect().bottom};});
  assert.ok(mobileShelf.shelf>=mobileShelf.before&&mobileShelf.after>=mobileShelf.end,'on mobile Shorts follow the first video rather than the entire feed');
  await feed.locator('.shorts-grid').focus();await yt.keyboard.press('ArrowRight');
  await yt.waitForFunction(()=>document.querySelector('#intent-home-feed').shadowRoot.querySelector('.shorts-grid').scrollLeft>50);
  await feed.locator('.shorts-grid').evaluate(el=>el.blur());
  await yt.screenshot({path:path.join(shots,'intent-home-shorts-mobile.png'),fullPage:true});
  await yt.setViewportSize({width:1660,height:1100});
  await yt.waitForFunction(count=>document.querySelector('#intent-home-feed').shadowRoot.querySelector('.first-grid').children.length===count,firstRow.length);
  assert.equal(await feed.locator('.card').count(),20,'responsive splitting never duplicates cards');
  await feed.locator('.shorts-grid').evaluate(el=>{el.blur();el.scrollLeft=0;});
  await yt.waitForFunction(()=>document.querySelector('#intent-home-feed').shadowRoot.querySelector('.shorts-grid').scrollLeft<=1);
  await yt.screenshot({path:path.join(shots,'intent-home-shorts.png'),fullPage:true});
  assert.equal(await feed.locator('[data-video-id="w0000000098"]').count(),0,'unrelated videos stay excluded with Shorts visible');
  await yt.evaluate(()=>{testSettings.hideShorts=true;testHandlers.forEach(f=>f({type:'SETTINGS',settings:testSettings}));});
  await yt.waitForFunction(()=>!document.querySelector('#intent-home-feed').shadowRoot.querySelector('[data-video-id="m0000000097"]'));
  assert.equal(await feed.locator('.shorts-shelf').isVisible(),false);
  assert.equal(await feed.locator('.rest-grid').isVisible(),false,'without Shorts the regular feed becomes one continuous grid again');
  assert.equal(await feed.locator('.first-grid .card').count(),12);
  await chooseMode(toolbar,'work');
  await yt.waitForFunction(()=>document.querySelector('#intent-home-feed').shadowRoot.querySelector('.title')?.textContent.includes('Python'));
  assert.equal(await yt.evaluate(()=>testSettings.mode),'work','masthead selector changes the active intent');
  await yt.evaluate(()=>{const old=document.querySelector('ytd-masthead');const fresh=old.cloneNode(true);fresh.querySelector('#intent-toolbar')?.remove();old.replaceWith(fresh);});
  await yt.locator('ytd-masthead #intent-toolbar').waitFor();
  assert.equal(await yt.locator('#intent-toolbar').count(),1,'rerendering the masthead reattaches one toolbar');
  // Out-of-order old mode results must never overwrite the newly selected mode.
  await yt.evaluate(()=>setTestMode('music'));
  await yt.waitForFunction(()=>document.querySelector('#intent-home-feed')?.shadowRoot.querySelector('.title')?.textContent.includes('jazz'));
  await yt.evaluate(()=>{testDelayWork=true;setTestMode('work');});
  await yt.waitForFunction(()=>testRequests.at(-1).key.includes('work'));
  await yt.evaluate(()=>setTestMode('study'));
  await chooseMode(toolbar,'study');
  await yt.waitForFunction(()=>document.querySelector('#intent-home-feed').shadowRoot.querySelector('.title')?.textContent.includes('Physics'));
  await yt.waitForTimeout(400);
  assert.ok((await feed.locator('.title').allTextContents()).every(t=>t.includes('Physics')));
  const calls=await yt.evaluate(()=>testRequests.length);
  await yt.evaluate(()=>{testSettings.dailyMinutes=35;testHandlers.forEach(f=>f({type:'SETTINGS',settings:testSettings}));});
  await yt.waitForTimeout(200);assert.equal(await yt.evaluate(()=>testRequests.length),calls,'budget changes do not rebuild the feed');
  await yt.setViewportSize({width:390,height:844});
  assert.equal(await yt.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'home grid fits a narrow viewport');
  await yt.setViewportSize({width:1660,height:1100});
  await yt.screenshot({path:path.join(shots,'intent-home-feed.png'),fullPage:true});
  await yt.evaluate(()=>{testFail=true;});await toolbar.getByRole('button',{name:'Refresh feed',exact:true}).click();
  await feed.getByRole('heading',{name:'Your feed couldn’t load.'}).waitFor();
  await yt.waitForFunction(()=>document.querySelector('#intent-toolbar')?.dataset.filterState==='unavailable');
  assert.equal(await toolbar.locator('.compact-state').textContent(),'Unavailable');assert.equal(await toolbar.locator('.compact-state').isVisible(),true);
  assert.equal(await feed.locator('.card').count(),0);assert.equal(await yt.locator('#music').isVisible(),false);
  assert.ok(await feed.getByRole('link',{name:'Open this topic on YouTube search'}).isVisible());
  await yt.evaluate(()=>{testFail=false;setTestMode('off');});
  await yt.locator('#intent-home-feed').waitFor({state:'detached'});
  assert.equal(await yt.locator('#music').isVisible(),true);
  for(const id of ['bait','short','shelf'])assert.equal(await yt.locator('#'+id).isVisible(),false);
  await yt.waitForFunction(()=>document.querySelector('#intent-toolbar')?.shadowRoot.querySelector('#intent-mode-trigger')?.dataset.mode==='off');
  assert.equal(await toolbar.getByRole('combobox',{name:'Intent mode',exact:true}).getAttribute('data-mode'),'off','turning modes off remains explicit in the masthead');
  assert.deepEqual(await yt.locator('#primary').evaluate(el=>({width:el.getBoundingClientRect().width,margin:getComputedStyle(el).margin,padding:getComputedStyle(el).padding})),nativePrimary,'native layout is restored without extension side spacing');
  await yt.evaluate(()=>{testSettings.hideShorts=false;testHandlers.forEach(f=>f({type:'SETTINGS',settings:testSettings}));});
  await yt.locator('#shelf').waitFor({state:'visible'});
  assert.equal(await yt.locator('#shelf').isVisible(),true,'native Shorts shelf is restored when Hide Shorts is disabled');
  assert.equal(await yt.locator('#native-short').isVisible(),true);
  await yt.evaluate(()=>{testSettings.hideShorts=true;testHandlers.forEach(f=>f({type:'SETTINGS',settings:testSettings}));});
  // Native cards outside home retain distraction filtering, including newly loaded cards.
  await yt.evaluate(()=>{history.pushState({},'', '/results?search_query=python');document.querySelector('ytd-browse').setAttribute('page-subtype','search');setTestMode('work');document.dispatchEvent(new Event('yt-navigate-finish'));const card=document.createElement('yt-lockup-view-model');card.id='lazy';card.innerHTML='<h3>You won’t believe this programming trick!!!</h3>';document.querySelector('#primary').append(card);});
  await yt.locator('#lazy[data-intent-hidden]').waitFor({state:'attached'});
  await yt.waitForFunction(()=>document.querySelector('#intent-toolbar')?.dataset.filterState==='off-here');
  assert.equal(await toolbar.locator('.compact-state').textContent(),'Off here');assert.equal(await toolbar.locator('.compact-state').isVisible(),true,'search results clearly say intent filtering is off here');
  assert.equal(await toolbar.getByRole('combobox',{name:'Intent mode',exact:true}).getAttribute('data-mode'),'work','the selected intent is saved while search filtering is off');
  assert.equal(await yt.locator('#work').isVisible(),true);
  // The same SPA now opens a video. Replace only recommendations, preserving the player and chat.
  await yt.evaluate(()=>{
    history.pushState({},'', '/watch?v=w0000000000');
    document.querySelector('ytd-browse').setAttribute('hidden','');
    const watch=document.createElement('ytd-watch-flexy');watch.innerHTML='<style>ytd-watch-flexy{display:grid;grid-template-columns:minmax(0,1fr) 410px;gap:24px;padding:24px;max-width:1500px;margin:auto}#player{height:360px;background:#181818;color:white}#related{display:block}#below{grid-column:1/-1}@media(max-width:700px){ytd-watch-flexy{display:block;padding:12px}#player{height:200px}#secondary{width:100%}}</style><main><div id="player"><video id="playing-video"></video><strong>Current video — keep playing</strong></div><h2>Python programming for useful tools</h2></main><aside id="secondary"><div id="chat">Live chat stays available</div><div id="related"><ytd-watch-next-secondary-results-renderer id="native-related"><ytd-compact-video-renderer id="native-watch-card"><h3 id="video-title">Unrelated cooking recipe</h3></ytd-compact-video-renderer></ytd-watch-next-secondary-results-renderer></div></aside><div id="below"></div>';
    document.body.append(watch);window.testPlayer=document.querySelector('#playing-video');window.playerPauses=0;testPlayer.pause=()=>{playerPauses++;};testPlayer.currentTime=37;
    testDelayWork=false;setTestMode('work');document.dispatchEvent(new Event('yt-navigate-finish'));
  });
  const watchFeed=yt.locator('#intent-watch-feed');
  await yt.waitForFunction(()=>document.querySelector('#intent-watch-feed')?.shadowRoot.querySelectorAll('.card').length>=11);
  assert.equal(await yt.locator('#native-related').isVisible(),false);
  assert.equal(await yt.locator('#chat').isVisible(),true);
  assert.equal(await yt.locator('#intent-home-feed').count(),0);
  assert.equal(await watchFeed.locator('[data-video-id="w0000000000"]').count(),0,'the current video is never recommended');
  assert.equal(await watchFeed.locator('.meta').first().innerText(),'3.9M views · 2 years ago');
  await yt.evaluate(()=>{document.querySelector('ytd-watch-flexy').style.gridTemplateColumns='minmax(0,1fr) 330px';document.querySelector('#secondary').style.width='330px';});
  const compactWatch=await watchFeed.locator('.card').first().evaluate(card=>{const thumb=card.querySelector('.cover').getBoundingClientRect(),title=card.querySelector('.title').getBoundingClientRect();return{width:thumb.width,gap:title.x-thumb.right};});
  assert.ok(Math.abs(compactWatch.width-168)<1&&compactWatch.gap>=6,'a narrow recommendation sidebar retains YouTube-sized thumbnails instead of shrinking them to 42%');
  await yt.evaluate(()=>{document.querySelector('ytd-watch-flexy').style.gridTemplateColumns='';document.querySelector('#secondary').style.width='';});
  assert.ok(await yt.evaluate(()=>testRequests.at(-1).exclude.includes('w0000000000')),'each batch excludes the current video');
  const recBoxes=await watchFeed.locator('.card').evaluateAll(cards=>cards.slice(0,4).map(c=>{const r=c.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};}));
  assert.ok(recBoxes.every(r=>Math.abs(r.x-recBoxes[0].x)<1),'watch recommendations form one compact column');
  for(let i=1;i<recBoxes.length;i++)assert.ok(recBoxes[i].y-recBoxes[i-1].y-recBoxes[i-1].h<25,'no empty card slots in recommendations');
  assert.equal(await yt.evaluate(()=>testPlayer===document.querySelector('#playing-video')&&testPlayer.currentTime===37&&playerPauses===0),true,'mounting recommendations preserves player state');
  await yt.evaluate(()=>setTestMode('music'));
  await yt.waitForFunction(()=>document.querySelector('#intent-watch-feed')?.shadowRoot.querySelector('.title')?.textContent.includes('jazz'));
  assert.equal(await yt.evaluate(()=>testPlayer===document.querySelector('#playing-video')&&testPlayer.currentTime===37&&playerPauses===0),true,'switching modes never pauses or replaces the watched video');
  // Explicit YouTube appearance takes precedence over the OS preference and updates live.
  await yt.emulateMedia({colorScheme:'dark'});
  await yt.evaluate(()=>document.documentElement.removeAttribute('dark'));
  const theme=()=>watchFeed.locator('.title').first().evaluate(el=>{const css=getComputedStyle(el);return{color:css.color,background:getComputedStyle(el.getRootNode().host).backgroundColor};});
  await yt.waitForTimeout(200);const lightTheme=await theme();
  assert.equal(await watchFeed.getAttribute('data-theme'),'light');
  assert.equal(await toolbar.getAttribute('data-theme'),'light','masthead controls follow YouTube light appearance');
  assert.equal(lightTheme.color,'rgb(15, 15, 15)');
  await yt.evaluate(()=>document.documentElement.setAttribute('dark',''));
  await yt.waitForTimeout(200);const darkTheme=await theme();
  assert.equal(await watchFeed.getAttribute('data-theme'),'dark');
  assert.equal(await toolbar.getAttribute('data-theme'),'dark','masthead controls follow YouTube dark appearance');
  assert.equal(darkTheme.color,'rgb(241, 241, 241)');
  assert.notEqual(darkTheme.color,lightTheme.color,'YouTube dark mode changes text colors live');
  await yt.emulateMedia({colorScheme:'light'});await yt.waitForTimeout(100);
  assert.equal((await theme()).color,darkTheme.color,'explicit YouTube dark mode wins over OS light');
  await yt.screenshot({path:path.join(shots,'intent-watch-dark.png'),fullPage:true});
  await yt.evaluate(()=>document.documentElement.removeAttribute('dark'));await yt.waitForTimeout(200);
  assert.equal((await theme()).color,lightTheme.color,'returning to YouTube light restores readable text');
  await yt.screenshot({path:path.join(shots,'intent-watch-light.png'),fullPage:true});
  // Reparenting related below the player and replacing its native DOM must retain a filled feed.
  await yt.setViewportSize({width:390,height:844});
  await yt.evaluate(()=>{document.querySelector('#below').append(document.querySelector('#related'));document.dispatchEvent(new Event('yt-navigate-finish'));});
  assert.equal(await yt.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'below-player recommendations fit mobile width');
  await watchFeed.locator('.card').first().waitFor();
  await yt.evaluate(()=>{const rec=document.createElement('ytd-compact-video-renderer');rec.id='late-native';rec.innerHTML='<h3 id="video-title">Unrelated late native result</h3>';document.querySelector('#related').append(rec);});
  await yt.locator('#late-native[data-intent-native-watch]').waitFor({state:'attached'});
  assert.equal(await yt.locator('#late-native').isVisible(),false,'new native recommendations cannot leak through the intent feed');
  assert.equal(await yt.evaluate(()=>document.querySelector('#below #intent-watch-feed')!==null),true);
  await yt.setViewportSize({width:1660,height:1100});
  await yt.evaluate(()=>{testDelayWork=true;setTestMode('work');});
  await yt.waitForFunction(()=>testRequests.at(-1).key.includes('work'));
  await yt.evaluate(()=>setTestMode('study'));
  await yt.waitForFunction(()=>document.querySelector('#intent-watch-feed')?.shadowRoot.querySelector('.title')?.textContent.includes('Physics'));
  await yt.waitForTimeout(400);
  assert.ok((await watchFeed.locator('.title').allTextContents()).every(t=>t.includes('Physics')),'old mode results cannot overwrite watch recommendations');
  await yt.evaluate(()=>{testDelayWork=false;history.pushState({},'', '/watch?v=s0000000001');document.dispatchEvent(new Event('yt-navigate-finish'));});
  await yt.waitForFunction(()=>testRequests.at(-1).exclude.includes('s0000000001'));
  await yt.waitForFunction(()=>document.querySelector('#intent-watch-feed')?.shadowRoot.querySelectorAll('.card').length>=11);
  assert.equal(await watchFeed.locator('[data-video-id="s0000000001"]').count(),0,'SPA video navigation refreshes and excludes the new current video');
  await yt.evaluate(()=>setTestMode('off'));
  await watchFeed.waitFor({state:'detached'});
  assert.equal(await yt.locator('#native-related').isVisible(),true,'turning modes off restores native video recommendations');
  assert.equal(await yt.evaluate(()=>testPlayer===document.querySelector('#playing-video')&&testPlayer.currentTime===37&&playerPauses===0),true);
  // YouTube can finish changing the URL while the outgoing watch renderer is still visible.
  await yt.evaluate(()=>setTestMode('study'));
  await yt.waitForFunction(()=>document.querySelector('#intent-watch-feed')?.shadowRoot.querySelector('.title')?.textContent.includes('Physics'));
  await yt.evaluate(()=>{
    const cached=document.querySelector('ytd-browse');cached.id='cached-home';cached.setAttribute('page-subtype','home');cached.hidden=true;cached.style.display='none';
    document.querySelector('ytd-masthead #start').innerHTML='<a id="logo" href="/">YouTube</a>';
    document.querySelector('#logo').addEventListener('click',event=>{
      event.preventDefault();document.dispatchEvent(new CustomEvent('yt-navigate-start',{detail:{url:'/'}}));history.pushState({},'', '/');
      document.dispatchEvent(new Event('yt-navigate-finish'));
      window.outgoingWatchDisplay=getComputedStyle(document.querySelector('#native-related')).display;
    });
  });
  await yt.locator('#logo').click();
  assert.equal(await yt.evaluate(()=>outgoingWatchDisplay),'none','navigation finish never reveals outgoing native watch recommendations');
  await yt.waitForTimeout(180); // Let the normal coalesced DOM scan run with the outgoing renderer still visible.
  assert.equal(await yt.locator('#native-related').evaluate(el=>getComputedStyle(el).display),'none');
  assert.equal(await yt.locator('#playing-video').isVisible(),true,'the player remains visible while YouTube has not replaced its watch renderer');
  assert.equal(await yt.evaluate(()=>testPlayer===document.querySelector('#playing-video')&&testPlayer.currentTime===37&&playerPauses===0),true);
  const incomingHome=await yt.evaluate(()=>{
    const browse=document.createElement('ytd-browse');browse.id='live-home';browse.setAttribute('page-subtype','home');browse.innerHTML='<div id="primary"><ytd-rich-grid-renderer id="home-flash-native">Unrelated native recommendations</ytd-rich-grid-renderer></div>';document.body.append(browse);
    const watch=document.querySelector('ytd-watch-flexy');watch.hidden=true;watch.style.display='none';
    return getComputedStyle(document.querySelector('#home-flash-native')).display;
  });
  assert.equal(incomingHome,'none','Home content arriving after navigate-finish is hidden synchronously');
  await yt.waitForFunction(()=>document.querySelector('#live-home #intent-home-feed')?.shadowRoot.querySelector('.title')?.textContent.includes('Physics'));
  assert.equal(await yt.locator('#cached-home #intent-home-feed').count(),0,'a hidden cached Home renderer cannot capture the replacement feed');
  const lateHome=await yt.evaluate(()=>{const native=document.createElement('ytd-rich-grid-renderer');native.id='late-home-native';native.textContent='Late unrelated recommendations';document.querySelector('#live-home #primary').append(native);return{display:getComputedStyle(native).display,marked:native.hasAttribute('data-intent-native-home')};});
  assert.deepEqual(lateHome,{display:'none',marked:false},'late native Home children are hidden by policy before the mutation observer marks them');
  await yt.evaluate(()=>{const live=document.querySelector('#live-home');live.hidden=true;live.style.display='none';const cached=document.querySelector('#cached-home');cached.hidden=false;cached.style.display='block';});
  await yt.waitForFunction(()=>document.querySelector('#cached-home #intent-home-feed')?.shadowRoot.querySelector('.title')?.textContent.includes('Physics'));
  assert.equal(await yt.locator('#live-home #intent-home-feed').count(),0,'hidden renderer changes move the replacement to the visible cached Home');
  await yt.route('https://www.youtube.com/shorts/**',route=>route.fulfill({contentType:'text/html',body:directShortsFixture}));
  await yt.goto('https://www.youtube.com/shorts/test');
  for (const file of ['core.js','feed.js','feed-theme.js','home.js','toolbar.js']) await yt.addScriptTag({path:root+'/src/'+file});
  await yt.evaluate(()=>{window.testSettings=IntentCore.defaults();window.testPaused=false;window.shortHandlers=[];window.chrome={runtime:{id:'test',getURL:s=>'https://extension.test/'+s,onMessage:{addListener:fn=>shortHandlers.push(fn)},sendMessage:async()=>({ok:true,settings:testSettings,tabPaused:testPaused,blocked:false})}};window.setShortsState=(hideShorts,paused=false)=>{testSettings.hideShorts=hideShorts;testPaused=paused;shortHandlers.forEach(fn=>fn({type:'SETTINGS',settings:testSettings,tabPaused:paused}));};});
  await yt.addStyleTag({path:root+'/src/content.css'});
  await yt.addScriptTag({path:root+'/src/content.js'});await yt.locator('#intent-shorts-gate').waitFor();
  await yt.locator('#intent-shorts-gate').getByRole('heading',{name:'Shorts are hidden',exact:true}).waitFor();
  assert.equal(await yt.locator('#intent-shorts-gate').getByRole('link',{name:'Back to Home',exact:true}).isVisible(),true);
  assert.equal(await yt.locator('#shorts-player').isVisible(),false);assert.equal(await yt.locator('#guide-shorts').isVisible(),false);assert.equal(await yt.locator('#guide-shorts-nohref').isVisible(),false,'native primary Shorts entries without href follow hide/pause settings');
  assert.equal(await yt.locator('#logo').isVisible(),true);assert.equal(await yt.locator('#guide-home').isVisible(),true);
  assert.equal(await yt.evaluate(()=>shortPauses>0&&shortsPlayer.paused),true);
  const gateLayout=await yt.locator('#intent-shorts-gate').evaluate(el=>{const r=el.getBoundingClientRect(),css=getComputedStyle(el);return{x:r.x,y:r.y,bg:css.backgroundColor,color:css.color,position:css.position};});
  assert.ok(gateLayout.x>=200&&gateLayout.y>=56,'the Shorts gate stays inside content, below the masthead and beside the guide');
  assert.ok(!gateLayout.bg.startsWith('rgba(')||gateLayout.bg.endsWith(', 1)'),'the gate has an opaque background');assert.notEqual(gateLayout.color,gateLayout.bg);
  await yt.screenshot({path:path.join(shots,'intent-shorts-blocked.png'),fullPage:true});
  const pauses=await yt.evaluate(()=>shortPauses);await yt.evaluate(()=>{shortPlaying=true;shortsPlayer.dispatchEvent(new Event('play',{bubbles:true}));});assert.ok(await yt.evaluate(()=>shortPauses)>pauses,'Shorts autoplay is paused again');
  await yt.evaluate(()=>setShortsState(false));await yt.locator('#intent-shorts-gate').waitFor({state:'detached'});assert.equal(await yt.locator('#shorts-player').isVisible(),true);assert.equal(await yt.locator('#guide-shorts').isVisible(),true);assert.equal(await yt.locator('#guide-shorts-nohref').isVisible(),true,'native primary Shorts entries without href follow hide/pause settings');
  await yt.evaluate(()=>setShortsState(true));await yt.locator('#intent-shorts-gate').waitFor();
  await yt.evaluate(()=>setShortsState(true,true));await yt.locator('#intent-shorts-gate').waitFor({state:'detached'});assert.equal(await yt.locator('#shorts-player').isVisible(),true);assert.equal(await yt.locator('#guide-shorts').isVisible(),true);assert.equal(await yt.locator('#guide-shorts-nohref').isVisible(),true,'native primary Shorts entries without href follow hide/pause settings');
  await yt.evaluate(()=>setShortsState(true,false));await yt.locator('#intent-shorts-gate').waitFor();
  await yt.locator('#logo').click();await yt.waitForURL('https://www.youtube.com/');
  const blocked=await context.newPage();
  await blocked.addInitScript(()=>{window.blockState={ok:true,blocked:true,settings:{dailyMinutes:60},resetAt:Date.now()+3600000};window.chrome={runtime:{sendMessage:async()=>blockState},tabs:{getCurrent:async()=>({id:5}),remove:async()=>{}}};});
  await blocked.goto('file://'+root+'/blocked.html');
  await blocked.getByText('Your budget resets in',{exact:false}).waitFor();
  assert.match(await blocked.locator('#block-detail').innerText(),/60-minute/);
  await blocked.evaluate(()=>{blockState.blocked=false;return refresh();});
  await blocked.getByText('A fresh start is waiting.').waitFor();
  assert.equal(await blocked.locator('#close-tab').innerText(),'Return to YouTube →');
  assert.deepEqual(errors,[]);
  console.log('PASS: Home and watch recommendations, player preservation, SPA navigation, current-video exclusion, live YouTube light/dark appearance, masthead controls, Shorts toggle restoration, full-width native layout, compact responsive layouts, stale-response protection, native restoration, Shorts gate, settings persistence and popup. Chrome messaging mocked for DOM tests.');
 }finally{await b.close()}
})().catch(e=>{console.error(e);process.exitCode=1})
