const {chromium}=require('playwright'),path=require('path'),assert=require('assert/strict'),fs=require('fs'),os=require('os');

// A tiny bundled-in-test silent WAV exercises real native media state across isolated worlds.
const shortAudio=Buffer.alloc(16044);shortAudio.write('RIFF',0);shortAudio.writeUInt32LE(16036,4);shortAudio.write('WAVE',8);shortAudio.write('fmt ',12);shortAudio.writeUInt32LE(16,16);shortAudio.writeUInt16LE(1,20);shortAudio.writeUInt16LE(1,22);shortAudio.writeUInt32LE(8000,24);shortAudio.writeUInt32LE(16000,28);shortAudio.writeUInt16LE(2,32);shortAudio.writeUInt16LE(16,34);shortAudio.write('data',36);shortAudio.writeUInt32LE(16000,40);
const directShortsFixture=`<!doctype html><meta charset="utf-8"><style>html{--yt-spec-base-background:#fff;--yt-spec-text-primary:#0f0f0f;--yt-spec-text-secondary:#606060}html[dark]{--yt-spec-base-background:#0f0f0f;--yt-spec-text-primary:#f1f1f1;--yt-spec-text-secondary:#aaa}body{margin:0;background:var(--yt-spec-base-background);color:var(--yt-spec-text-primary);font-family:Arial,sans-serif}ytd-masthead{position:fixed;top:0;left:0;right:0;z-index:2020;height:56px;display:flex;align-items:center;gap:20px;padding:0 20px;background:var(--yt-spec-base-background)}ytd-masthead #center{display:flex;align-items:center;flex:1;min-width:0}#search{display:flex;flex:1}#search input{width:100%;min-width:0}#logo{display:block;color:inherit;padding:10px;text-decoration:none}ytd-guide-renderer{display:block;position:fixed;left:0;top:56px;bottom:0;width:200px;background:var(--yt-spec-base-background);z-index:2010}ytd-guide-entry-renderer{display:block;padding:14px}ytd-guide-renderer a{color:inherit}ytd-page-manager{display:block;margin:56px 0 0 216px;padding:16px;min-height:calc(100vh - 56px)}ytd-shorts{display:block;height:700px;background:#97004f;color:white}video{width:300px;height:550px}</style><ytd-app><ytd-masthead><div id="start"><a id="logo" href="/">YouTube</a></div><div id="center"><form id="search"><input aria-label="Search"></form></div><div id="end">Account</div></ytd-masthead><ytd-guide-renderer><ytd-guide-entry-renderer><a id="guide-home" href="/">Home</a></ytd-guide-entry-renderer><ytd-guide-entry-renderer id="guide-shorts"><a href="/shorts/Q0000000000">Shorts</a></ytd-guide-entry-renderer><ytd-guide-entry-renderer id="guide-shorts-nohref" is-primary><a id="endpoint" role="link" title="Shorts" tabindex="-1"><tp-yt-paper-item role="link"><yt-formatted-string class="title">Shorts</yt-formatted-string></tp-yt-paper-item></a></ytd-guide-entry-renderer></ytd-guide-renderer><ytd-page-manager><ytd-shorts id="shorts-player"><video id="short-video" autoplay muted loop src="data:audio/wav;base64,${shortAudio.toString('base64')}"></video><h2>Native Shorts player</h2></ytd-shorts></ytd-page-manager></ytd-app><script>window.shortPlayEvents=0;window.shortsPlayer=document.querySelector('#short-video');shortsPlayer.addEventListener('play',()=>shortPlayEvents++);shortsPlayer.play().catch(()=>{});</script>`;

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
 const root=path.resolve(__dirname,'..');
 const shots=path.resolve(process.env.INTENT_SCREENSHOTS||'test-results');fs.mkdirSync(shots,{recursive:true});
 const context=await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(),'intent-extension-')),{channel:'chromium',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:[`--load-extension=${root}`],viewport:{width:1660,height:1100}});context.setDefaultTimeout(20000);
 const texts={W:['Ship a tiny app this weekend','Turn an idea into a working tool for your clients, from the first screen to a finished release.'],M:['Blue notes after midnight','A mellow trio with double bass, brushed drums, and saxophone.'],S:['Why the sky changes colour','An accessible explanation of scattering and wavelengths from sunlight.']};
 const ids={};const renderers=[];const networkCounts={searches:0,metadata:0};const searchLocales=[];
 for(const [prefix,[title,description]]of Object.entries(texts))for(let i=0;i<12;i++){const id=prefix+String(i).padStart(10,'0');ids[id]={title:title+' · '+(i+1),description};renderers.push({videoRenderer:{videoId:id,title:{simpleText:ids[id].title},ownerText:{simpleText:prefix==='S'?'Curious Minds':'Studio '+prefix},detailedMetadataSnippets:[{snippetText:{simpleText:description}}],thumbnail:{thumbnails:[{url:'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg'}]},lengthText:{simpleText:'12:40'},viewCountText:{simpleText:'39 lakh views'},publishedTimeText:{simpleText:'2 years ago'}}});}
 ids.Q0000000000={title:'Python programming tutorial in sixty seconds',description:'Build useful software with Python programming.'};
 ids.R0000000000={title:'Jazz piano improvisation in sixty seconds',description:'A quick piano jazz music performance.'};
 renderers.push({reelShelfRenderer:{items:[{reelItemRenderer:{videoId:'Q0000000000',headline:{simpleText:ids.Q0000000000.title},thumbnail:{thumbnails:[{url:'https://i.ytimg.com/vi/Q0000000000/hqdefault.jpg'}]},navigationEndpoint:{reelWatchEndpoint:{videoId:'Q0000000000'},commandMetadata:{webCommandMetadata:{url:'/shorts/Q0000000000'}}}}},{reelItemRenderer:{videoId:'R0000000000',headline:{simpleText:ids.R0000000000.title},thumbnail:{thumbnails:[{url:'https://i.ytimg.com/vi/R0000000000/hqdefault.jpg'}]},navigationEndpoint:{reelWatchEndpoint:{videoId:'R0000000000'},commandMetadata:{webCommandMetadata:{url:'/shorts/R0000000000'}}}}}]}});
 const masthead='<ytd-masthead><div id="start">YouTube</div><div id="center"><form id="search"><input aria-label="Search" placeholder="Search"></form></div><div id="end">Account</div></ytd-masthead>';
 const mastheadCSS='ytd-masthead{display:flex;height:56px;align-items:center;padding:0 16px;gap:24px}ytd-masthead #start{flex:0 0 169px}ytd-masthead #end{flex:0 0 80px}ytd-masthead #center{display:flex;flex:1;max-width:728px;margin-inline:auto;min-width:0;align-items:center;gap:8px}@media(max-width:700px){ytd-masthead #start{flex-basis:auto}ytd-masthead #end{flex-basis:auto}}#search{display:flex;flex:1;max-width:640px;min-width:0}#search input{min-width:0;width:100%;padding:8px;border-radius:20px}';
 const localeBootstrap=(hl='en-GB',gl='DE')=>'<script>var ytcfg={set:function(value){this.data_=value}};ytcfg.set('+JSON.stringify({INNERTUBE_CONTEXT:{client:{hl,gl}}})+');</script>';
 const search=gl=>'<script>var ytInitialData = '+JSON.stringify({contents:{twoColumnSearchResultsRenderer:{primaryContents:{sectionListRenderer:{contents:[{itemSectionRenderer:{contents:renderers.map(item=>item.videoRenderer?{videoRenderer:{...item.videoRenderer,viewCountText:{simpleText:gl==='IN'?'39 lakh views':'3.9M views'}}}:item)}}]}}}}})+';</script>';
 const pageErrors=[],consoleErrors=[];
 context.on('page',page=>{page.on('pageerror',error=>pageErrors.push({url:page.url(),message:error.message}));page.on('console',message=>{if(message.type()==='error')consoleErrors.push({url:page.url(),message:message.text()});});});
 try{
  await context.route('https://www.youtube.com/**',async route=>{
   const url=new URL(route.request().url()),india=url.searchParams.get('intent-test')==='india';
   if(url.pathname.startsWith('/shorts/'))return route.fulfill({contentType:'text/html',body:directShortsFixture});
   if(url.pathname==='/results'){
    if(route.request().isNavigationRequest())return route.fulfill({contentType:'text/html',body:'<!doctype html>'+localeBootstrap()+'<meta charset="utf-8"><style>body{margin:0;font-family:Arial,sans-serif}'+mastheadCSS+'</style>'+masthead+'<ytd-search><div id="primary"><ytd-video-renderer><h3 id="video-title">Python programming tutorial</h3></ytd-video-renderer></div></ytd-search>'});
    networkCounts.searches++;searchLocales.push({hl:url.searchParams.get('hl'),gl:url.searchParams.get('gl')});return route.fulfill({contentType:'text/html',body:search(url.searchParams.get('gl'))});
   }
   if(url.pathname==='/watch'){
    const videoId=url.searchParams.get('v');
    const metadata='<script>var ytInitialPlayerResponse = '+JSON.stringify({videoDetails:{videoId:videoId,title:ids[videoId]?.title,shortDescription:ids[videoId]?.description}})+';</script>';
    if(!route.request().isNavigationRequest()){networkCounts.metadata++;return route.fulfill({contentType:'text/html',body:metadata});}
    return route.fulfill({contentType:'text/html',body:'<!doctype html><html dark>'+localeBootstrap()+'<meta charset="utf-8"><style>:root{--yt-spec-base-background:#fff;--yt-spec-text-primary:#0f0f0f;--yt-spec-text-secondary:#606060}html[dark]{--yt-spec-base-background:#0f0f0f;--yt-spec-text-primary:#f1f1f1;--yt-spec-text-secondary:#aaa}body{margin:0;background:var(--yt-spec-base-background);color:var(--yt-spec-text-primary);font-family:Arial,sans-serif}'+mastheadCSS+'.top{padding:18px 30px;border-bottom:1px solid #333}ytd-watch-flexy{display:grid;grid-template-columns:minmax(0,1fr) 410px;gap:24px;padding:24px}#player{height:440px;background:#080808}#related{display:block}@media(max-width:700px){ytd-watch-flexy{display:block;padding:12px}#player{height:200px}}</style>'+masthead+'<div class="top">YouTube · Intent preview — synthetic recommendations, actual packaged model</div><ytd-watch-flexy><main><div id="player"><video id="playing-video"></video></div><h2>'+ids[videoId].title+'</h2><p>'+ids[videoId].description+'</p></main><aside id="secondary"><div id="chat">Live chat stays available</div><div id="related"><ytd-watch-next-secondary-results-renderer id="native-related">Original unrelated recommendations</ytd-watch-next-secondary-results-renderer></div></aside></ytd-watch-flexy>'+metadata+'<script>window.testPlayer=document.querySelector("#playing-video");window.playerPauses=0;testPlayer.pause=()=>{playerPauses++;};testPlayer.currentTime=37;</script></html>'});
   }
   return route.fulfill({contentType:'text/html',body:'<!doctype html>'+localeBootstrap(india?'en-IN':'en-GB',india?'IN':'DE')+'<meta charset="utf-8"><style>body{margin:0;background:#f8f8f2;color:#283b30;font-family:system-ui}'+mastheadCSS+'.top{padding:18px 30px;border-bottom:1px solid #dfe2d7}ytd-browse{display:block}#primary{width:100%;margin:0}</style>'+masthead+'<div class="top">YouTube · Intent preview — synthetic recommendations, actual packaged model</div><ytd-browse page-subtype="home"><div id="primary"><ytd-rich-grid-renderer id="native">Original unrelated recommendations</ytd-rich-grid-renderer></div></ytd-browse>'});
  });
  await context.route('https://i.ytimg.com/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#d8dfc8"/><circle cx="490" cy="230" r="160" fill="#c0cdae"/><path d="M60 240h220M60 190h150" stroke="#718465" stroke-width="12" stroke-linecap="round"/></svg>'}));
  const ext=await context.newPage();await ext.goto('chrome://extensions');await ext.locator('extensions-item').waitFor();const id=await ext.locator('extensions-item').getAttribute('id');
  const settings=await context.newPage();await settings.goto(`chrome-extension://${id}/settings.html`);await settings.getByRole('heading',{name:'Your daily budget'}).waitFor();
  console.log('PASS fresh-install settings load without warming the model manually');
  const worker=context.serviceWorkers()[0];assert.ok(worker);
  // Headless Chromium inherits the host's idle state, which can flip while the
  // operator reads test output. Keep this external input active; unit tests
  // separately cover idle/locked accounting. All timer logic stays real.
  await worker.evaluate(()=>{chrome.idle.queryState=async()=> 'active';});
  // Record actual Chrome icon writes while preserving the native API implementation.
  await worker.evaluate(()=>{const original=chrome.action.setIcon;globalThis.__intentActionIconCalls=[];chrome.action.setIcon=function(details,...args){globalThis.__intentActionIconCalls.push({tabId:details.tabId,imageData:details.imageData});return original.call(chrome.action,details,...args);};});
  const iconWrites=tabId=>worker.evaluate(tabId=>globalThis.__intentActionIconCalls.filter(call=>call.tabId===tabId).length,tabId);
  const iconMatches=async(tabId,variant)=>worker.evaluate(async({tabId,variant})=>{const call=globalThis.__intentActionIconCalls.filter(call=>call.tabId===tabId).at(-1),expected=(await actionIconImages())[variant];return Boolean(call&&expected)&&[16,32].every(size=>call.imageData[size].data.every((value,index)=>value===expected[size].data[index]));},{tabId,variant});
  const expectReloadRepaint=async(page,tabId,before)=>{const deadline=Date.now()+5000;while(await iconWrites(tabId)<=before&&Date.now()<deadline)await page.waitForTimeout(25);assert.ok(await iconWrites(tabId)>before,'the browser action icon is repainted automatically after reload');};
  const tabIdFor=page=>settings.evaluate(async url=>{const tabs=await chrome.tabs.query({url:'https://www.youtube.com/*'});return tabs.find(tab=>tab.url===url)?.id;},page.url());
  const actionFor=async page=>{const tabId=await tabIdFor(page);assert.ok(Number.isInteger(tabId));return settings.evaluate(async tabId=>({badge:await chrome.action.getBadgeText({tabId}),title:await chrome.action.getTitle({tabId})}),tabId);};
  const pixels=await worker.evaluate(async()=>{const images=await actionIconImages();return Object.fromEntries(Object.entries(images).map(([state,sizes])=>[state,Object.fromEntries(Object.entries(sizes).map(([size,image])=>[size,{width:image.width,height:image.height,gray:image.data.every((value,index,pixels)=>index%4!==0||value===pixels[index+1]&&value===pixels[index+2]),hasColor:image.data.some((value,index,pixels)=>index%4===0&&pixels[index+3]>0&&(value!==pixels[index+1]||value!==pixels[index+2]))}]))]));});
  for(const size of [16,32]){assert.equal(pixels.active[size].width,size);assert.equal(pixels.inactive[size].height,size);assert.equal(pixels.active[size].hasColor,true);assert.equal(pixels.inactive[size].gray,true);assert.equal(pixels.paused[size].width,size);assert.equal(pixels.paused[size].gray,true);}
  assert.equal(await worker.evaluate(async()=>{const {paused,inactive}=await actionIconImages();return[16,32].every(size=>paused[size].data.some((value,index)=>value!==inactive[size].data[index]));}),true,'paused bars are visually distinct from the inactive brand icon');
  assert.equal(await worker.evaluate(async()=>{const {paused}=await actionIconImages();return[16,32].every(size=>[.35,.65].every(fraction=>{const index=(Math.floor(size*.5)*size+Math.floor(size*fraction))*4;return[0,1,2,3].every(channel=>paused[size].data[index+channel]===255);}));}),true,'the paused action has two visible white bars at both toolbar resolutions');

  const yt=await context.newPage();await yt.goto('https://www.youtube.com/');const feed=yt.locator('#intent-home-feed');
  await yt.waitForFunction(()=>document.querySelector('#intent-home-feed')?.shadowRoot.querySelectorAll('.card').length>=12,null,{timeout:60000});
  const titles=await feed.locator('.title').allTextContents();assert.ok(titles.every(t=>t.startsWith('Ship a tiny app')));assert.equal(await yt.locator('#native').isVisible(),false);
  assert.ok(searchLocales.length>0&&searchLocales.every(locale=>locale.hl==='en-GB'&&locale.gl==='DE'),'public searches follow the native page language and region');
  assert.equal(await feed.locator('.meta').first().innerText(),'3.9M views · 2 years ago');
  const regionalPage=await context.newPage();await regionalPage.goto('https://www.youtube.com/?intent-test=india');
  await regionalPage.waitForFunction(()=>document.querySelector('#intent-home-feed')?.shadowRoot.querySelectorAll('.card').length>=12,null,{timeout:60000});
  assert.equal(await regionalPage.locator('#intent-home-feed .meta').first().innerText(),'39 lakh views · 2 years ago','India-region view text is preserved rather than reformatted universally');
  assert.ok(searchLocales.some(locale=>locale.hl==='en-IN'&&locale.gl==='IN'),'regional searches use a distinct locale-aware cache');
  assert.equal(await feed.locator('.meta').first().innerText(),'3.9M views · 2 years ago','a different region cannot overwrite this page’s metadata');
  await regionalPage.close();await yt.bringToFront();

  assert.match((await actionFor(yt)).title,/Work intent.*timer counts toward your daily limit/);assert.equal((await actionFor(yt)).badge,'W');
  const workTabId=await tabIdFor(yt),workWrites=await iconWrites(workTabId);
  await yt.reload();
  await yt.waitForFunction(()=>document.querySelector('#intent-home-feed')?.shadowRoot.querySelectorAll('.card').length>=12,null,{timeout:60000});
  await expectReloadRepaint(yt,workTabId,workWrites);assert.equal(await iconMatches(workTabId,'active'),true);
  assert.equal((await actionFor(yt)).badge,'W');assert.match((await actionFor(yt)).title,/Work intent.*timer counts toward your daily limit/);
  assert.equal(await yt.locator('#intent-toolbar').getByRole('combobox',{name:'Intent mode',exact:true}).getAttribute('data-mode'),'work');
  await yt.bringToFront();await yt.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await yt.waitForFunction(()=>document.querySelector('#intent-toolbar')?.shadowRoot.querySelector('#intent-timer')?.dataset.tabCounting==='true').catch(async error=>{
    const environment=await worker.evaluate(async()=>({idle:await chrome.idle.queryState(60),window:await chrome.windows.getLastFocused(),tracker,activeTabs:await chrome.tabs.query({active:true})}));
    throw new Error(error.message+'; foreground timer diagnostic: '+JSON.stringify(environment));
  });
  assert.equal(await yt.locator('#intent-toolbar #intent-timer').getAttribute('data-timer-state'),'normal');
  const installedClock=yt.locator('#intent-toolbar #intent-timer'),timerDetails=yt.locator('#intent-toolbar #intent-timer-popover');
  await installedClock.press('Enter');await timerDetails.getByRole('heading',{name:'Daily budget',exact:true}).waitFor();
  assert.deepEqual(await timerDetails.locator('dt').allTextContents(),['Remaining','Used'],'the budget popover shows two concise values');
  assert.equal(await timerDetails.locator('#intent-timer-context').isVisible(),false,'ordinary counting does not add a paragraph');
  assert.equal(await timerDetails.getByRole('button',{name:'Timer settings',exact:true}).count(),0,'the clock does not duplicate the existing Intent settings shortcut');
  assert.ok((await timerDetails.innerText()).length<100,'the visible budget summary stays compact');
  assert.match(await installedClock.getAttribute('title'),/midnight/i,'reset information remains available in the clock tooltip');
  await timerDetails.getByRole('button',{name:'Close timer details',exact:true}).click();
  assert.equal(await installedClock.evaluate(el=>el.getRootNode().activeElement===el),true,'closing details restores keyboard focus to the clock');
  const searchTimer=await context.newPage();await searchTimer.goto('https://www.youtube.com/results?search_query=python');await searchTimer.bringToFront();
  await searchTimer.waitForFunction(()=>{const host=document.querySelector('#intent-toolbar'),clock=host?.shadowRoot.querySelector('#intent-timer');return host?.dataset.filterState==='off-here'&&clock?.dataset.tabCounting==='true';});
  assert.equal(await searchTimer.locator('#intent-toolbar #intent-timer').getAttribute('data-timer-running'),'true','search time still counts when intent filtering is off here');
  assert.equal((await actionFor(searchTimer)).badge,'W','the toolbar clock does not replace the Chrome action badge');
  await searchTimer.close();await yt.bringToFront();
  console.log('PASS real offscreen Work feed, automatic icon restoration and explicit counting clock including unfiltered search pages');
  const toolbar=yt.locator('#intent-toolbar');await toolbar.waitFor();
  assert.equal(await yt.locator('ytd-masthead #center #intent-toolbar').count(),0,'the installed toolbar stays outside the native search flex row');
  const searchUnchanged=await yt.evaluate(()=>{const host=document.querySelector('#intent-toolbar'),search=document.querySelector('#search'),input=search.querySelector('input'),measure=el=>{const r=el.getBoundingClientRect();return{x:r.x,width:r.width};},before=[measure(search),measure(input)],parent=host.parentNode,next=host.nextSibling;host.remove();const native=[measure(search),measure(input)];parent.insertBefore(host,next);return{before,native};});
  assert.deepEqual(searchUnchanged.before,searchUnchanged.native,'installed controls preserve the native search width and position');
  const logo=toolbar.locator('.logo');await logo.waitFor();
  const brand=await logo.evaluate(el=>({tag:el.tagName.toLowerCase(),src:el.getAttribute('src'),viewBox:el.getAttribute('viewBox'),loaded:el instanceof HTMLImageElement?el.complete&&el.naturalWidth>0:el.querySelectorAll('circle,path').length>=2}));
  assert.equal(brand.loaded,true,'the toolbar brand renders without a failed extension image');
  assert.equal(brand.tag,'svg');assert.equal(brand.src,null);assert.equal(brand.viewBox,'0 0 128 128');assert.equal(await logo.locator('circle').getAttribute('fill'),'#3b5b3f');assert.equal(await logo.locator('path').getAttribute('fill'),'#f3f5e6');assert.equal(await logo.locator('[href],[src]').count(),0);

  const glassFixture=await installGlassFixture(yt);assert.deepEqual(glassFixture,{initiallyCovered:true,mastheadBottom:64});
  await assertFirstRowUncovered(yt);
  await yt.screenshot({path:path.join(shots,'intent-home-glass-clear-installed.png')});
  await chooseMode(toolbar,'off');await feed.waitFor({state:'detached'});await assertGlassRestored(yt);
  await chooseMode(toolbar,'work');await feed.locator('.cover').first().waitFor();await assertFirstRowUncovered(yt);
  await settings.evaluate(targetTabId=>chrome.runtime.sendMessage({type:'SET_TAB_PAUSED',targetTabId,paused:true}),workTabId);
  await feed.waitFor({state:'detached'});await assertGlassRestored(yt);
  await settings.evaluate(targetTabId=>chrome.runtime.sendMessage({type:'SET_TAB_PAUSED',targetTabId,paused:false}),workTabId);
  await feed.locator('.cover').first().waitFor();await assertFirstRowUncovered(yt);
  await removeGlassFixture(yt);
  console.log('PASS nested opaque Home glass cannot cover first-row thumbnails; Off/Pause restore native decoration');

  const settingsIcons=await settings.evaluate(()=>Object.fromEntries(['work','study','music'].map(id=>[id,document.querySelector(`[data-mode="${id}"] .mode-icon svg`).innerHTML])));
  const toolbarIcons=await yt.evaluate(()=>Object.fromEntries(['work','study','music'].map(id=>[id,document.querySelector('#intent-toolbar').shadowRoot.querySelector(`[role=option][data-mode="${id}"] .option-symbol svg`).innerHTML])));
  assert.deepEqual(toolbarIcons,settingsIcons,'built-in intent icons match between settings and the actual toolbar');
  // Reordering the settings cards persists immediately and reaches the installed toolbar.
  const expectOrder=async expected=>{await settings.waitForFunction(async expected=>{const state=await chrome.runtime.sendMessage({type:'GET_STATE'});return JSON.stringify(state.settings.intentOrder)===JSON.stringify(expected);},expected);await yt.waitForFunction(expected=>JSON.stringify([...document.querySelector('#intent-toolbar').shadowRoot.querySelectorAll('[role=option]')].map(option=>option.dataset.mode).filter(id=>id!=='off'))===JSON.stringify(expected),expected);};
  await settings.locator('[data-drag-intent="study"]').dragTo(settings.locator('[data-order-intent="work"]'));
  await expectOrder(['study','work','music']);
  assert.equal(await toolbar.getByRole('combobox',{name:'Intent mode',exact:true}).getAttribute('data-mode'),'work','dragging a card keeps this tab intent');
  await settings.locator('[data-drag-intent="study"]').press('End');await expectOrder(['work','music','study']);
  await settings.locator('[data-drag-intent="study"]').press('Home');await expectOrder(['study','work','music']);
  await settings.reload();await settings.locator('[data-drag-intent="work"]').waitFor();await expectOrder(['study','work','music']);
  await settings.locator('[data-drag-intent="work"]').press('Home');await expectOrder(['work','study','music']);
  assert.equal(await settings.locator('#intent-order').count(),0);
  console.log('PASS actual settings-card drag and keyboard ordering persist without switching intent and synchronize with the installed toolbar');
  await yt.locator('ytd-masthead #intent-toolbar').waitFor();
  assert.equal(await feed.locator('header').isVisible(),false,'intent controls are in the masthead rather than a separate banner');
  const width=await feed.evaluate(el=>({actual:el.getBoundingClientRect().width,available:el.parentElement.getBoundingClientRect().width}));
  assert.ok(Math.abs(width.actual-width.available)<2,'feed fills native content width without side bars');
  assert.equal(await feed.locator('[data-video-id="Q0000000000"]').count(),0,'Shorts hidden by default');
  await settings.evaluate(()=>chrome.runtime.sendMessage({type:'UPDATE_SETTINGS',patch:{hideShorts:false}}));
  await feed.locator('[data-video-id="Q0000000000"]').waitFor({timeout:60000});
  assert.equal(await feed.locator('[data-video-id="Q0000000000"] .title').getAttribute('href'),'https://www.youtube.com/shorts/Q0000000000');
  assert.equal(await feed.locator('[data-video-id="R0000000000"]').count(),0,'unrelated Shorts remain filtered by intent');
  await settings.evaluate(()=>chrome.runtime.sendMessage({type:'UPDATE_SETTINGS',patch:{hideShorts:true}}));
  await yt.waitForFunction(()=>!document.querySelector('#intent-home-feed')?.shadowRoot.querySelector('[data-video-id="Q0000000000"]'));
  console.log('PASS installed extension includes relevant Shorts only when Hide Shorts is disabled');

  await chooseMode(toolbar,'music');
  await yt.waitForFunction(()=>document.querySelector('#intent-home-feed')?.shadowRoot.querySelector('.title')?.textContent.startsWith('Blue notes'),null,{timeout:60000});
  assert.ok((await feed.locator('.title').allTextContents()).every(t=>t.startsWith('Blue notes')));
  await yt.waitForFunction(()=>document.querySelector('#intent-toolbar')?.shadowRoot.querySelector('#intent-timer')?.dataset.timerState==='exempt');
  assert.equal(await yt.locator('#intent-toolbar #intent-timer').getAttribute('data-tab-counting'),'false');
  console.log('PASS switching modes refreshes the filled feed using description-based semantic classification');
  await toolbar.getByRole('button',{name:'Refresh feed',exact:true}).click();
  await yt.waitForFunction(()=>document.querySelector('#intent-home-feed')?.shadowRoot.querySelectorAll('.card').length>=12,null,{timeout:60000});
  assert.ok((await feed.locator('.title').allTextContents()).every(t=>t.startsWith('Blue notes')));
  await yt.screenshot({path:path.join(shots,'intent-home-feed.png'),fullPage:true});
  await settings.locator('[data-edit="work"]').click();
  await expandAdvanced(settings);
  await settings.locator('#blocked-terms').fill('unsaved appearance draft');
  await settings.evaluate(()=>{window.draftField=document.querySelector('#blocked-terms');});
  await yt.goto('https://www.youtube.com/watch?v=M0000000000');
  const watchFeed=yt.locator('#intent-watch-feed');
  await yt.waitForFunction(()=>document.querySelector('#intent-watch-feed')?.shadowRoot.querySelectorAll('.card').length>=11,null,{timeout:60000});
  assert.ok((await watchFeed.locator('.title').allTextContents()).every(t=>t.startsWith('Blue notes')));
  assert.equal(await watchFeed.locator('.meta').first().innerText(),'3.9M views · 2 years ago');
  await yt.evaluate(()=>{document.querySelector('ytd-watch-flexy').style.gridTemplateColumns='minmax(0,1fr) 330px';document.querySelector('#secondary').style.width='330px';});
  const watchThumbnail=await watchFeed.locator('.cover').first().boundingBox();assert.ok(Math.abs(watchThumbnail.width-168)<1,'the installed watch list keeps a 168px thumbnail in a narrow sidebar');
  await yt.evaluate(()=>{document.querySelector('ytd-watch-flexy').style.gridTemplateColumns='';document.querySelector('#secondary').style.width='';});
  assert.equal(await watchFeed.locator('[data-video-id="M0000000000"]').count(),0);
  assert.equal(await yt.locator('#native-related').isVisible(),false);assert.equal(await yt.locator('#chat').isVisible(),true);
  assert.equal(await yt.evaluate(()=>testPlayer===document.querySelector('#playing-video')&&testPlayer.currentTime===37&&playerPauses===0),true);
  assert.equal(await watchFeed.getAttribute('data-theme'),'dark');
  await settings.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
  assert.equal(await settings.locator('#blocked-terms').inputValue(),'unsaved appearance draft');
  assert.equal(await settings.evaluate(()=>draftField===document.querySelector('#blocked-terms')),true,'appearance changes preserve the current settings form and draft');
  await yt.screenshot({path:path.join(shots,'intent-watch-dark.png'),fullPage:true});
  await chooseMode(toolbar,'work');
  await yt.waitForFunction(()=>document.querySelector('#intent-watch-feed')?.shadowRoot.querySelector('.title')?.textContent.startsWith('Ship a tiny app'),null,{timeout:60000});
  assert.ok((await watchFeed.locator('.title').allTextContents()).every(t=>t.startsWith('Ship a tiny app')));
  assert.equal(await yt.evaluate(()=>testPlayer===document.querySelector('#playing-video')&&testPlayer.currentTime===37&&playerPauses===0),true);
  await yt.evaluate(()=>document.documentElement.removeAttribute('dark'));
  await yt.waitForFunction(()=>document.querySelector('#intent-watch-feed')?.dataset.theme==='light');
  await settings.waitForFunction(()=>document.documentElement.dataset.theme==='light');
  assert.equal(await settings.locator('#blocked-terms').inputValue(),'unsaved appearance draft');
  await yt.screenshot({path:path.join(shots,'intent-watch-light.png'),fullPage:true});
  await chooseMode(toolbar,'off');
  await watchFeed.waitFor({state:'detached'});assert.equal(await yt.locator('#native-related').isVisible(),true);assert.equal(await toolbar.getByRole('combobox',{name:'Intent mode',exact:true}).getAttribute('data-mode'),'off','mode off is visible while native recommendations return');
  assert.equal((await actionFor(yt)).badge,'OFF');assert.match((await actionFor(yt)).title,/Off on this tab; topic filtering is off; timer counts/);
  const offWrites=await iconWrites(workTabId);
  await yt.reload();await yt.waitForFunction(()=>document.querySelector('#intent-toolbar')?.shadowRoot.querySelector('#intent-mode-trigger')?.dataset.mode==='off');
  await expectReloadRepaint(yt,workTabId,offWrites);assert.equal(await iconMatches(workTabId,'inactive'),true);
  assert.equal((await actionFor(yt)).badge,'OFF');assert.match((await actionFor(yt)).title,/Off on this tab; topic filtering is off; timer counts/);
  assert.equal(await yt.locator('#native-related').isVisible(),true);assert.equal(await watchFeed.count(),0);
  await settings.evaluate(async()=>{const [tab]=await chrome.tabs.query({url:'https://www.youtube.com/watch?v=M0000000000'});return chrome.runtime.sendMessage({type:'UPDATE_SETTINGS',targetTabId:tab.id,patch:{mode:'music'}});});
  await yt.waitForFunction(()=>document.querySelector('#intent-watch-feed')?.shadowRoot.querySelectorAll('.card').length>=11,null,{timeout:60000});
  console.log('PASS real installed extension replaces watch recommendations, excludes current video, follows YouTube appearance and preserves playback during mode changes');
  await settings.locator('#close-editor').click();
  // URL/finish can precede renderer replacement: protect both outgoing and incoming recommendations.
  await yt.evaluate(()=>{
    window.transitionPlayer=document.querySelector('#playing-video');window.transitionTime=transitionPlayer.currentTime;
    const cached=document.createElement('ytd-browse');cached.id='cached-home';cached.setAttribute('page-subtype','home');cached.hidden=true;cached.style.display='none';cached.innerHTML='<div id="primary"><ytd-rich-grid-renderer>Cached native Home recommendations</ytd-rich-grid-renderer></div>';document.body.append(cached);
    document.querySelector('ytd-masthead #start').innerHTML='<a id="logo" href="/">YouTube</a>';
    document.querySelector('#logo').addEventListener('click',event=>{
      event.preventDefault();document.dispatchEvent(new CustomEvent('yt-navigate-start',{detail:{endpoint:{commandMetadata:{webCommandMetadata:{url:'/'}}}}}));history.pushState({},'', '/');
      document.dispatchEvent(new Event('yt-navigate-finish'));
      window.outgoingWatchDisplay=getComputedStyle(document.querySelector('#native-related')).display;
    });
  });
  await yt.locator('#logo').click();assert.equal(await yt.evaluate(()=>outgoingWatchDisplay),'none','the outgoing native watch recommendations remain hidden at navigation finish');
  await yt.waitForTimeout(180); // Exercise the coalesced scan while the old visible watch renderer remains.
  assert.equal(await yt.locator('#native-related').evaluate(el=>getComputedStyle(el).display),'none');
  assert.equal(await yt.locator('#playing-video').isVisible(),true);
  assert.equal(await yt.evaluate(()=>transitionPlayer===document.querySelector('#playing-video')&&transitionPlayer.currentTime===transitionTime&&playerPauses===0),true,'protecting outgoing recommendations leaves the player untouched');
  const incomingHome=await yt.evaluate(()=>{
    const browse=document.createElement('ytd-browse');browse.id='live-home';browse.setAttribute('page-subtype','home');browse.innerHTML='<div id="primary"><ytd-rich-grid-renderer id="home-flash-native">Unrelated native recommendations</ytd-rich-grid-renderer></div>';document.body.append(browse);
    const watch=document.querySelector('ytd-watch-flexy');watch.hidden=true;watch.style.display='none';
    return getComputedStyle(document.querySelector('#home-flash-native')).display;
  });
  assert.equal(incomingHome,'none','Home arriving after finish is hidden before any DOM observer or another finish event');
  await yt.waitForFunction(()=>document.querySelector('#live-home #intent-home-feed')?.shadowRoot.querySelector('.title')?.textContent.startsWith('Blue notes'),null,{timeout:60000});
  assert.equal(await yt.locator('#cached-home #intent-home-feed').count(),0);
  const lateHome=await yt.evaluate(()=>{const native=document.createElement('ytd-rich-grid-renderer');native.id='late-home-native';native.textContent='Late unrelated recommendations';document.querySelector('#live-home #primary').append(native);return{display:getComputedStyle(native).display,marked:native.hasAttribute('data-intent-native-home')};});
  assert.deepEqual(lateHome,{display:'none',marked:false},'new native Home children stay hidden after the replacement has mounted');
  await yt.goto('https://www.youtube.com/watch?v=M0000000000');await yt.locator('#intent-toolbar').waitFor();
  console.log('PASS watch-to-Home navigation protects outgoing watch recommendations, late Home renderers and post-mount native insertions without pausing the player');
  const directShorts=await context.newPage();await directShorts.goto('https://www.youtube.com/shorts/Q0000000000');
  await directShorts.locator('#intent-shorts-gate').waitFor();
  assert.equal(await directShorts.locator('#shorts-player').isVisible(),false);assert.equal(await directShorts.locator('#guide-shorts').isVisible(),false);assert.equal(await directShorts.locator('#guide-shorts-nohref').isVisible(),false,'native primary Shorts entries without href follow hide/pause settings');assert.equal(await directShorts.locator('#logo').isVisible(),true);assert.equal(await directShorts.locator('#guide-home').isVisible(),true);
  await directShorts.waitForFunction(()=>shortPlayEvents>0&&shortsPlayer.paused);
  const playEvents=await directShorts.evaluate(()=>shortPlayEvents);await directShorts.evaluate(()=>shortsPlayer.play().catch(()=>{}));await directShorts.waitForFunction(before=>shortPlayEvents>before&&shortsPlayer.paused,playEvents);
  const gateLayout=await directShorts.locator('#intent-shorts-gate').evaluate(el=>{const r=el.getBoundingClientRect(),css=getComputedStyle(el);return{x:r.x,y:r.y,bg:css.backgroundColor,color:css.color};});
  assert.ok(gateLayout.x>=200&&gateLayout.y>=56);assert.ok(!gateLayout.bg.startsWith('rgba(')||gateLayout.bg.endsWith(', 1)'));assert.notEqual(gateLayout.color,gateLayout.bg);
  await settings.evaluate(()=>chrome.runtime.sendMessage({type:'UPDATE_SETTINGS',patch:{hideShorts:false}}));await directShorts.locator('#intent-shorts-gate').waitFor({state:'detached'});assert.equal(await directShorts.locator('#shorts-player').isVisible(),true);assert.equal(await directShorts.locator('#guide-shorts').isVisible(),true);assert.equal(await directShorts.locator('#guide-shorts-nohref').isVisible(),true,'native primary Shorts entries without href follow hide/pause settings');
  await settings.evaluate(()=>chrome.runtime.sendMessage({type:'UPDATE_SETTINGS',patch:{hideShorts:true}}));await directShorts.locator('#intent-shorts-gate').waitFor();
  const directId=await tabIdFor(directShorts);await settings.evaluate(targetTabId=>chrome.runtime.sendMessage({type:'SET_TAB_PAUSED',targetTabId,paused:true}),directId);await directShorts.locator('#intent-shorts-gate').waitFor({state:'detached'});assert.equal(await directShorts.locator('#shorts-player').isVisible(),true);assert.equal(await directShorts.locator('#guide-shorts').isVisible(),true);assert.equal(await directShorts.locator('#guide-shorts-nohref').isVisible(),true,'native primary Shorts entries without href follow hide/pause settings');
  await settings.evaluate(targetTabId=>chrome.runtime.sendMessage({type:'SET_TAB_PAUSED',targetTabId,paused:false}),directId);await directShorts.locator('#intent-shorts-gate').waitFor();
  await directShorts.locator('#intent-shorts-gate').getByRole('heading',{name:'Shorts are hidden',exact:true}).waitFor();
  await directShorts.locator('#intent-shorts-gate').getByRole('link',{name:'Back to Home',exact:true}).click();await directShorts.waitForURL('https://www.youtube.com/');await directShorts.locator('#intent-home-feed').waitFor();
  await directShorts.goto('https://www.youtube.com/shorts/Q0000000000');await directShorts.locator('#intent-shorts-gate').waitFor();
  await directShorts.locator('#logo').click();await directShorts.waitForURL('https://www.youtube.com/');await directShorts.locator('#intent-home-feed').waitFor();await directShorts.close();
  console.log('PASS direct Shorts is paused and hidden behind an opaque content-only gate; guide/logo navigation and hide/pause restoration remain usable');
  // Each tab remembers its own intent, including reloads and configurable new-tab defaults.
  const second=await context.newPage();await second.goto('https://www.youtube.com/?intent-test=second');
  await chooseMode(second.locator('#intent-toolbar'),'study');
  await second.waitForFunction(()=>document.querySelector('#intent-home-feed')?.shadowRoot.querySelector('.title')?.textContent.startsWith('Why the sky'),null,{timeout:60000});
  assert.equal(await toolbar.getByRole('combobox',{name:'Intent mode',exact:true}).getAttribute('data-mode'),'music','a second tab never changes the first tab intent');
  await second.bringToFront();await yt.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await yt.waitForFunction(()=>{const clock=document.querySelector('#intent-toolbar')?.shadowRoot.querySelector('#intent-timer');return clock?.dataset.timerState==='exempt'&&clock.dataset.tabCounting==='false'&&clock.dataset.timerRunning==='true';});
  await yt.reload();await yt.locator('#intent-toolbar').getByRole('combobox',{name:'Intent mode',exact:true}).waitFor();
  assert.equal(await yt.locator('#intent-toolbar').getByRole('combobox',{name:'Intent mode',exact:true}).getAttribute('data-mode'),'music','reloading restores this tab intent');
  await settings.evaluate(()=>chrome.runtime.sendMessage({type:'UPDATE_SETTINGS',patch:{newTabMode:'work'}}));
  const third=await context.newPage();await third.goto('https://www.youtube.com/?intent-test=third');
  await third.locator('#intent-toolbar').getByRole('combobox',{name:'Intent mode',exact:true}).waitFor();
  assert.equal(await third.locator('#intent-toolbar').getByRole('combobox',{name:'Intent mode',exact:true}).getAttribute('data-mode'),'work','fixed new-tab policy is applied');
  assert.equal(await second.locator('#intent-toolbar').getByRole('combobox',{name:'Intent mode',exact:true}).getAttribute('data-mode'),'study');
  await settings.evaluate(()=>chrome.runtime.sendMessage({type:'UPDATE_SETTINGS',patch:{newTabMode:'last'}}));
  await chooseMode(third.locator('#intent-toolbar'),'music');
  const followed=await context.newPage();await followed.goto('https://www.youtube.com/?intent-test=followed');
  await followed.locator('#intent-toolbar').getByRole('combobox',{name:'Intent mode',exact:true}).waitFor();
  assert.equal(await followed.locator('#intent-toolbar').getByRole('combobox',{name:'Intent mode',exact:true}).getAttribute('data-mode'),'music','follow-last policy uses the latest chosen intent');
  console.log('PASS independent per-tab intents survive reload and respect fixed/follow-last new-tab policies');
  const secondToolbar=second.locator('#intent-toolbar');
  await secondToolbar.getByRole('combobox',{name:'Intent mode',exact:true}).click();
  await secondToolbar.getByRole('button',{name:'Pause on this tab',exact:true}).click();
  await second.locator('#intent-home-feed').waitFor({state:'detached'});
  await secondToolbar.locator('[data-filter-state="paused"]').first().waitFor();
  assert.equal(await second.locator('#native').isVisible(),true,'pause restores native YouTube recommendations');
  assert.equal(await secondToolbar.getByRole('combobox',{name:'Intent mode',exact:true}).getAttribute('data-mode'),'study');
  assert.equal(await followed.locator('#intent-toolbar').getByRole('combobox',{name:'Intent mode',exact:true}).getAttribute('data-mode'),'music');
  assert.equal((await actionFor(second)).badge,'');assert.equal((await actionFor(second)).title,'Intent — Paused on this tab; filters and timer are off');
  await second.waitForFunction(()=>document.querySelector('#intent-toolbar')?.shadowRoot.querySelector('#intent-timer')?.dataset.timerState==='paused');
  assert.equal(await second.locator('#intent-toolbar #intent-timer').getAttribute('data-tab-counting'),'false');
  await second.evaluate(()=>{document.querySelector('#native').insertAdjacentHTML('beforeend','<ytd-video-renderer id="paused-clickbait"><h3 id="video-title">You won’t believe this!!!</h3></ytd-video-renderer><ytd-reel-shelf-renderer id="paused-shorts">Shorts</ytd-reel-shelf-renderer>');});
  assert.equal(await second.locator('#paused-clickbait').isVisible(),true);assert.equal(await second.locator('#paused-shorts').isVisible(),true);
  const pausedTabId=await tabIdFor(second),pausedWrites=await iconWrites(pausedTabId);
  await second.reload();await second.locator('#intent-toolbar [data-filter-state="paused"]').first().waitFor();
  await expectReloadRepaint(second,pausedTabId,pausedWrites);assert.equal(await iconMatches(pausedTabId,'paused'),true);
  assert.equal((await actionFor(second)).badge,'');assert.equal((await actionFor(second)).title,'Intent — Paused on this tab; filters and timer are off');
  assert.equal(await secondToolbar.getByRole('combobox',{name:'Intent mode',exact:true}).getAttribute('data-mode'),'study','reload keeps the saved paused intent');
  assert.equal(await second.locator('#native').isVisible(),true);assert.equal(await second.locator('#intent-home-feed').count(),0);
  const pausePopup=await context.newPage();await second.bringToFront();await pausePopup.goto(`chrome-extension://${id}/popup.html`);
  await pausePopup.getByRole('button',{name:'Resume on this tab',exact:true}).waitFor();
  await pausePopup.getByRole('button',{name:'Resume on this tab',exact:true}).click();
  await second.waitForFunction(()=>document.querySelector('#intent-home-feed')?.shadowRoot.querySelector('.title')?.textContent.startsWith('Why the sky'),null,{timeout:60000});
  assert.equal(await secondToolbar.getByRole('combobox',{name:'Intent mode',exact:true}).getAttribute('data-mode'),'study');
  await pausePopup.close();
  console.log('PASS per-tab pause restores native content, survives reload, leaves other tabs active and resumes its saved intent from the popup');
  // Optional templates add a mode without changing existing intent choices.
  const beforeAdd=await settings.evaluate(()=>chrome.runtime.sendMessage({type:'GET_STATE'}));
  await settings.locator('#intent-catalogue summary').click();
  await settings.locator('[data-add-template="ai"]').click();
  await settings.locator('[data-edit="custom-ai"]').waitFor();
  const afterAdd=await settings.evaluate(()=>chrome.runtime.sendMessage({type:'GET_STATE'}));
  assert.equal(afterAdd.settings.mode,beforeAdd.settings.mode,'adding a library template never switches the current intent');
  assert.equal(afterAdd.settings.customIntents['custom-ai'].templateId,'ai');assert.equal(afterAdd.settings.customIntents['custom-ai'].icon,'sparkles');
  assert.equal(await third.locator('#intent-toolbar').getByRole('combobox',{name:'Intent mode',exact:true}).getAttribute('data-mode'),'music');
  assert.equal(await settings.locator('[data-mode="leisure"]').count(),0,'fresh installs only include Work, Study and Music');
  await chooseMode(third.locator('#intent-toolbar'),'custom-ai','Artificial Intelligence');
  await settings.locator('[data-edit="custom-ai"]').click();
  await settings.locator('#intent-icon').selectOption('science');
  await settings.getByRole('button',{name:'Save preferences',exact:true}).click();
  await settings.getByText('All preferences saved on this device.',{exact:true}).waitFor();
  await settings.locator('#close-editor').click();
  const thirdToolbar=third.locator('#intent-toolbar');
  await thirdToolbar.getByRole('combobox',{name:'Intent mode',exact:true}).click();
  await third.locator('#intent-toolbar .option[data-mode="custom-ai"] .option-symbol').filter({hasText:'⚛'}).waitFor();
  assert.equal(await thirdToolbar.getByRole('option',{name:'Artificial Intelligence',exact:true}).getAttribute('aria-selected'),'true');
  await thirdToolbar.getByRole('combobox',{name:'Intent mode',exact:true}).press('Escape');
  for(let position=2;position>=0;position--){await settings.locator('[data-move-intent="custom-ai"][data-direction="-1"]').click();await settings.waitForFunction(async position=>{const state=await chrome.runtime.sendMessage({type:'GET_STATE'});return state.settings.intentOrder[position]==='custom-ai';},position);}
  await thirdToolbar.getByRole('combobox',{name:'Intent mode',exact:true}).click();
  await third.waitForFunction(()=>document.querySelector('#intent-toolbar')?.shadowRoot.querySelector('[role=option]')?.dataset.mode==='custom-ai');
  assert.equal(await thirdToolbar.getByRole('option').first().getAttribute('data-mode'),'custom-ai','saved intent order updates the actual toolbar');
  await thirdToolbar.getByRole('combobox',{name:'Intent mode',exact:true}).press('Escape');
  await settings.reload();await settings.locator('[data-edit="custom-ai"]').waitFor();
  const library=await settings.evaluate(()=>chrome.runtime.sendMessage({type:'GET_STATE'}));assert.equal(library.settings.intentOrder[0],'custom-ai');assert.equal(library.settings.customIntents['custom-ai'].icon,'science');
  await chooseMode(thirdToolbar,'music');
  console.log('PASS installed intent library adds without switching, preserves editable icons and synchronizes persistent ordering with the toolbar');
  // Create a custom intent through the actual UI and use its packaged semantic profile.
  await settings.getByRole('button',{name:'Create your own intent',exact:true}).click();
  await settings.locator('#intent-editor[open]').waitFor();
  await settings.locator('#intent-name').fill('Build apps');
  await settings.locator('#intent-description').fill('Build useful software applications and tools for clients, programming and delivering finished digital products.');
  await settings.locator('#intent-icon').selectOption('tools');
  await settings.locator('#channels').fill('Independent Builders');
  await settings.locator('#intent-count-time').uncheck();
  await expandAdvanced(settings);await settings.locator('#topics').fill('software tools');
  await settings.getByRole('button',{name:'Create intent',exact:true}).click();
  await settings.locator('#intent-editor[open]').waitFor({state:'detached'});
  await settings.getByRole('button',{name:'Build apps Your custom intent',exact:true}).waitFor();
  const customId=await settings.evaluate(async()=>{const state=await chrome.runtime.sendMessage({type:'GET_STATE'});return Object.entries(state.settings.customIntents).find(([,record])=>record.name==='Build apps')[0];});
  const createdState=await settings.evaluate(()=>chrome.runtime.sendMessage({type:'GET_STATE'}));
  assert.equal(createdState.settings.customIntents[customId].icon,'tools');assert.equal(createdState.settings.channels[customId],'Independent Builders');assert.equal(createdState.settings.customTopics[customId],'software tools');assert.equal(createdState.settings.countModes[customId],false);
  await settings.locator(`[data-edit="${customId}"]`).click();
  assert.equal(await settings.locator('#intent-name').inputValue(),'Build apps');
  assert.equal(await settings.locator('#intent-description').inputValue(),'Build useful software applications and tools for clients, programming and delivering finished digital products.');
  assert.equal(await settings.locator('#intent-icon').inputValue(),'tools');
  assert.equal(await settings.locator('#channels').inputValue(),'Independent Builders');
  assert.equal(await settings.locator('#intent-count-time').isChecked(),false);
  await expandAdvanced(settings);assert.equal(await settings.locator('#topics').inputValue(),'software tools');
  await settings.locator('#close-editor').click();
  // This later budget scenario intentionally counts the custom intent.
  await settings.evaluate(customId=>chrome.runtime.sendMessage({type:'UPDATE_SETTINGS',patch:{countModes:{[customId]:true}}}),customId);
  await chooseMode(third.locator('#intent-toolbar'),customId,'Build apps');
  await third.waitForFunction(()=>document.querySelector('#intent-home-feed')?.shadowRoot.querySelector('.title')?.textContent.startsWith('Ship a tiny app'),null,{timeout:60000});
  assert.ok((await third.locator('#intent-home-feed .title').allTextContents()).every(t=>t.startsWith('Ship a tiny app')));
  console.log('PASS shared creation/editor persists custom icon, channels, extra topics and timer policy; the created intent classifies meaning with the bundled model');
  // The opt-in preview uses the same packaged model, including meaning beyond lexical matches.
  const beforePreview=await settings.evaluate(async()=>{const state=await chrome.runtime.sendMessage({type:'GET_STATE'});const session=await chrome.storage.session.get(['tabModes','pausedTabs']);return{settings:state.settings,session};});
  assert.equal(beforePreview.settings.mode,customId);
  assert.equal(await settings.evaluate(({config,video})=>IntentCore.classify(video,config).visible,{config:beforePreview.settings,video:{...ids.W0000000000,id:'W0000000000',channel:'Studio W',shorts:false}}),false,'the preview example has no literal match to the saved custom scope');
  assert.equal(await settings.locator('.real-preview').count(),0,'real candidates are fetched only after explicit preview');
  assert.equal(await settings.locator('#show-hidden').isDisabled(),true,'custom intents do not show unrelated illustrative examples');
  const beforePreviewNetwork={...networkCounts};
  await settings.locator('#preview-intent').click();
  await settings.locator('.real-preview[data-accepted="true"] h3').filter({hasText:'Ship a tiny app'}).first().waitFor({timeout:60000});
  assert.equal(await settings.locator('.real-preview[data-accepted="false"]').count(),0,'filtered candidates are hidden until requested');
  await settings.locator('#show-hidden').click();
  await settings.locator('.real-preview[data-accepted="false"] h3').filter({hasText:'Blue notes'}).first().waitFor();
  assert.ok(await settings.locator('.real-preview[data-accepted="true"]').count()>0);
  assert.ok(networkCounts.searches-beforePreviewNetwork.searches<=2,'preview makes at most two public searches');
  assert.equal(networkCounts.metadata,beforePreviewNetwork.metadata,'preview makes no additional video-page requests');
  const afterPreview=await settings.evaluate(async()=>{const state=await chrome.runtime.sendMessage({type:'GET_STATE'});const session=await chrome.storage.session.get(['tabModes','pausedTabs']);return{settings:state.settings,session};});
  assert.deepEqual(afterPreview,beforePreview,'preview does not change saved intents, ordering, per-tab modes or pause state');
  console.log('PASS real-model custom preview includes a semantic paraphrase and optional rejected music examples, with bounded searches and unchanged settings/tab choices');
  // Remaining-time warnings are visible in the clock without altering Chrome action badges.
  await third.bringToFront();
  await worker.evaluate(()=>{days[IntentCore.dayKey()]=3000000;});
  await third.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await third.waitForFunction(()=>document.querySelector('#intent-toolbar')?.shadowRoot.querySelector('#intent-timer')?.dataset.timerState==='low');
  assert.equal(await third.locator('#intent-toolbar #intent-timer-popover').isVisible(),false);assert.equal((await actionFor(third)).badge,'B');
  await worker.evaluate(()=>{days[IntentCore.dayKey()]=3480000;});await third.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await third.waitForFunction(()=>document.querySelector('#intent-toolbar')?.shadowRoot.querySelector('#intent-timer')?.dataset.timerState==='critical');assert.equal((await actionFor(third)).badge,'B');
  assert.equal(await third.locator('#intent-toolbar #intent-timer-reminder').count(),0,'the unreliable reminder toast has been removed');
  await worker.evaluate(()=>{days[IntentCore.dayKey()]=60000;});await third.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  console.log('PASS actual timer distinguishes counting, exempt and paused tabs and shows low/critical states without changing Chrome badges');

  await secondToolbar.getByRole('combobox',{name:'Intent mode',exact:true}).click();
  await secondToolbar.getByRole('button',{name:'Pause on this tab',exact:true}).click();
  await second.locator('#intent-home-feed').waitFor({state:'detached'});
  await worker.evaluate(()=>{days[IntentCore.dayKey()]=60000;});
  await settings.evaluate(()=>chrome.runtime.sendMessage({type:'UPDATE_SETTINGS',patch:{dailyMinutes:1,newTabMode:'music'}}));
  await third.getByRole('heading',{name:'There’s a whole world'}).waitFor();
  await second.reload();await second.locator('#intent-toolbar [data-filter-state="paused"]').first().waitFor();
  assert.ok(second.url().includes('youtube.com/'),'a paused counted intent remains accessible at the daily limit');
  await secondToolbar.getByRole('combobox',{name:'Intent mode',exact:true}).click();
  await secondToolbar.getByRole('button',{name:'Resume on this tab',exact:true}).click();
  await second.getByRole('heading',{name:'There’s a whole world'}).waitFor();
  console.log('PASS actual network rules allow paused tabs at the budget limit and restore blocking on resume');
  assert.equal(yt.url(),'https://www.youtube.com/watch?v=M0000000000','Music remains available after the counted budget is exhausted');
  await yt.reload();await yt.locator('#intent-toolbar').waitFor();assert.ok(yt.url().includes('youtube.com/watch'));
  const exemptNew=await context.newPage();await exemptNew.goto('https://www.youtube.com/?intent-test=exempt');await exemptNew.locator('#intent-toolbar').waitFor();
  assert.equal(await exemptNew.locator('#intent-toolbar').getByRole('combobox',{name:'Intent mode',exact:true}).getAttribute('data-mode'),'music');
  await settings.evaluate(()=>chrome.runtime.sendMessage({type:'UPDATE_SETTINGS',patch:{newTabMode:'work'}}));
  const newTab=await context.newPage();await newTab.goto('https://www.youtube.com/').catch(error=>{if(!error.message.includes('ERR_ABORTED'))throw error;});
  await newTab.getByRole('heading',{name:'There’s a whole world'}).waitFor();assert.equal(newTab.url(),`chrome-extension://${id}/blocked.html`);
  await newTab.getByRole('button',{name:'Continue on YouTube',exact:false}).click();
  await newTab.locator('#intent-toolbar').waitFor();assert.equal(await newTab.locator('#intent-toolbar').getByRole('combobox',{name:'Intent mode',exact:true}).getAttribute('data-mode'),'music');
  console.log('PASS counted intents are blocked while existing/new exempt modes and break-page exemption controls remain accessible');
  await settings.evaluate(()=>chrome.runtime.sendMessage({type:'UPDATE_SETTINGS',patch:{dailyMinutes:60}}));
  await second.goto('https://www.youtube.com/?intent-test=second');await second.locator('#intent-toolbar').waitFor();
  assert.equal(await second.locator('#intent-toolbar').getByRole('combobox',{name:'Intent mode',exact:true}).getAttribute('data-mode'),'study');
  console.log('PASS increasing the budget removes the real network block without losing tab intent');
  await settings.locator('#metadata-limit').fill('12');await settings.locator('#metadata-limit').press('Tab');
  await settings.waitForFunction(async()=>{const state=await chrome.runtime.sendMessage({type:'GET_STATE'});return state.settings.metadataLimit===12;});
  await second.locator('#intent-toolbar').getByRole('combobox',{name:'Intent mode',exact:true}).click();
  await second.locator('#intent-toolbar').getByRole('option',{name:'Study',exact:true}).click();
  await settings.locator('#role-preset-select').selectOption('accountant');
  await settings.locator('#apply-role-preset').click();
  await settings.waitForFunction(async()=>{const state=await chrome.runtime.sendMessage({type:'GET_STATE'});return state.settings.lastRolePreset==='accountant';});
  const applied=await settings.evaluate(()=>chrome.runtime.sendMessage({type:'GET_STATE'}));
  assert.equal(applied.settings.intentDescriptions.work,applied.settings.rolePresets.accountant.workDescription);
  assert.equal(applied.settings.intentDescriptions.study,applied.settings.rolePresets.accountant.studyDescription);
  await settings.locator('[data-edit="work"]').click();
  assert.equal(await settings.locator('#intent-description').inputValue(),applied.settings.rolePresets.accountant.workDescription);
  const editedScope='Accounting workflows for independent studios: bookkeeping, reconciliation, invoices and financial reporting.';
  await settings.locator('#intent-description').fill(editedScope);
  await settings.getByRole('button',{name:'Save preferences',exact:true}).click();
  await settings.getByText('All preferences saved on this device.',{exact:true}).waitFor();
  const edited=await settings.evaluate(()=>chrome.runtime.sendMessage({type:'GET_STATE'}));
  assert.equal(edited.settings.intentDescriptions.work,editedScope);assert.equal(edited.settings.rolePresets.accountant.workDescription,applied.settings.rolePresets.accountant.workDescription,'editing Work leaves the reusable preset unchanged');
  await settings.locator('#close-editor').click();
  await settings.getByRole('button',{name:'Reset settings',exact:true}).click();
  await settings.getByRole('button',{name:'Reset to defaults',exact:true}).click();
  await second.waitForFunction(()=>document.querySelector('#intent-toolbar')?.shadowRoot.querySelector('#intent-mode-trigger')?.dataset.mode==='work');
  const reset=await settings.evaluate(()=>chrome.runtime.sendMessage({type:'GET_STATE'}));
  assert.equal(reset.settings.metadataLimit,4);assert.deepEqual(reset.settings.customIntents,{});assert.ok(reset.usedMs>=60000);assert.ok(reset.usedMs>=edited.usedMs);assert.equal(reset.settings.lastRolePreset,null);assert.equal(reset.settings.intentDescriptions.work,'');assert.deepEqual(reset.settings.intentOrder,['work','study','music']);
  assert.equal(await settings.getByRole('heading',{name:'Make it yours',exact:true}).count(),0);
  console.log('PASS role presets apply editable Work/Study scopes independently and factory reset restores defaults while retaining daily usage');
  await context.route('https://example.com/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><style>ytd-masthead,ytd-browse,ytd-rich-item-renderer{display:block}</style>'+masthead+'<ytd-browse page-subtype="home"><div id="primary"><ytd-rich-item-renderer id="outside-native"><h3>You won’t believe this!!!</h3></ytd-rich-item-renderer></div></ytd-browse>'}));
  const outside=await context.newPage();await outside.goto('https://example.com/');await outside.waitForTimeout(250);
  assert.equal(await outside.locator('#intent-toolbar,#intent-home-feed').count(),0,'no filtering UI is injected outside YouTube');
  assert.equal(await outside.locator('#outside-native').isVisible(),true,'outside page content is not filtered even when its DOM resembles YouTube');
  await outside.bringToFront();
  const outsideAction=await settings.evaluate(async()=>{const [tab]=await chrome.tabs.query({active:true,lastFocusedWindow:true});return{badge:await chrome.action.getBadgeText({tabId:tab.id}),title:await chrome.action.getTitle({tabId:tab.id})};});
  assert.deepEqual(outsideAction,{badge:'',title:'Intent — Off on this site. Only runs on YouTube.'});
  await context.route('https://www.youtube-nocookie.com/embed/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><ytd-masthead><div id="center"><form id="search"></form></div></ytd-masthead><ytd-browse page-subtype="home"><div id="primary"><ytd-rich-item-renderer id="embed-native"><h3>You won’t believe this!!!</h3></ytd-rich-item-renderer></div></ytd-browse>'}));
  await settings.evaluate(()=>chrome.runtime.sendMessage({type:'UPDATE_SETTINGS',patch:{dailyMinutes:1}}));
  await outside.evaluate(()=>{const iframe=document.createElement('iframe');iframe.src='https://www.youtube-nocookie.com/embed/abcdefghijk';iframe.id='external-embed';document.body.append(iframe);});
  await outside.frameLocator('#external-embed').locator('#embed-native').waitFor();
  assert.equal(await outside.frameLocator('#external-embed').locator('#intent-toolbar,#intent-home-feed').count(),0,'no scripts or budget redirects act on embedded frames inside other websites');
  assert.equal(await outside.frameLocator('#external-embed').locator('#embed-native').isVisible(),true);

  const popup=await context.newPage();await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.getByRole('heading',{name:'Intent only runs on YouTube.',exact:true}).waitFor();
  assert.equal(await popup.getByText('Off on this site',{exact:true}).isVisible(),true);
  assert.equal(await popup.locator('[data-mode]').count(),0);
  console.log('PASS real extension leaves outside sites untouched and its popup explicitly remains off');
  assert.deepEqual(pageErrors,[],'all installed extension pages remain free of unhandled errors');
  const unsafeLogoErrors=consoleErrors.filter(error=>/unsafe attempt to load URL|not allowed to load local resource: chrome-extension:|chrome-extension:.*(?:ERR_|blocked|denied)/i.test(error.message));
  assert.deepEqual(unsafeLogoErrors,[],'the toolbar does not make unsafe cross-origin extension resource requests');


 }finally{await context.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
