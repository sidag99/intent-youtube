const {chromium}=require('playwright'),path=require('path'),assert=require('assert/strict'),fs=require('fs'),os=require('os');
(async()=>{
 const root=path.resolve(__dirname,'..');
 const shots=path.resolve(process.env.INTENT_SCREENSHOTS||'test-results');fs.mkdirSync(shots,{recursive:true});
 const context=await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(),'intent-extension-')),{channel:'chromium',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:[`--load-extension=${root}`],viewport:{width:1440,height:1100}});context.setDefaultTimeout(20000);
 const texts={W:['Ship a tiny app this weekend','Turn an idea into a working tool for your clients, from the first screen to a finished release.'],M:['Blue notes after midnight','A mellow trio with double bass, brushed drums, and saxophone.'],S:['Why the sky changes colour','An accessible explanation of scattering and wavelengths from sunlight.']};
 const ids={};const renderers=[];
 for(const [prefix,[title,description]]of Object.entries(texts))for(let i=0;i<12;i++){const id=prefix+String(i).padStart(10,'0');ids[id]={title:title+' · '+(i+1),description};renderers.push({videoRenderer:{videoId:id,title:{simpleText:ids[id].title},ownerText:{simpleText:'Studio '+prefix},detailedMetadataSnippets:[{snippetText:{simpleText:description}}],thumbnail:{thumbnails:[{url:'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg'}]},lengthText:{simpleText:'12:40'}}});}
 const search='<script>var ytInitialData = '+JSON.stringify({contents:{twoColumnSearchResultsRenderer:{primaryContents:{sectionListRenderer:{contents:[{itemSectionRenderer:{contents:renderers}}]}}}}})+';</script>';
 try{
  await context.route('https://www.youtube.com/**',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname==='/results')return route.fulfill({contentType:'text/html',body:search});
   if(url.pathname==='/watch'){
    const videoId=url.searchParams.get('v');
    const metadata='<script>var ytInitialPlayerResponse = '+JSON.stringify({videoDetails:{videoId:videoId,title:ids[videoId]?.title,shortDescription:ids[videoId]?.description}})+';</script>';
    if(!route.request().isNavigationRequest())return route.fulfill({contentType:'text/html',body:metadata});
    return route.fulfill({contentType:'text/html',body:'<!doctype html><html dark><meta charset="utf-8"><style>:root{--yt-spec-base-background:#fff;--yt-spec-text-primary:#0f0f0f;--yt-spec-text-secondary:#606060}html[dark]{--yt-spec-base-background:#0f0f0f;--yt-spec-text-primary:#f1f1f1;--yt-spec-text-secondary:#aaa}body{margin:0;background:var(--yt-spec-base-background);color:var(--yt-spec-text-primary);font-family:Arial,sans-serif}.top{padding:18px 30px;border-bottom:1px solid #333}ytd-watch-flexy{display:grid;grid-template-columns:minmax(0,1fr) 410px;gap:24px;padding:24px}#player{height:440px;background:#080808}#related{display:block}@media(max-width:700px){ytd-watch-flexy{display:block;padding:12px}#player{height:200px}}</style><div class="top">YouTube · Intent preview — synthetic recommendations, actual packaged model</div><ytd-watch-flexy><main><div id="player"><video id="playing-video"></video></div><h2>'+ids[videoId].title+'</h2><p>'+ids[videoId].description+'</p></main><aside id="secondary"><div id="chat">Live chat stays available</div><div id="related"><ytd-watch-next-secondary-results-renderer id="native-related">Original unrelated recommendations</ytd-watch-next-secondary-results-renderer></div></aside></ytd-watch-flexy>'+metadata+'<script>window.testPlayer=document.querySelector("#playing-video");window.playerPauses=0;testPlayer.pause=()=>{playerPauses++;};testPlayer.currentTime=37;</script></html>'});
   }
   return route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#f8f8f2;color:#283b30;font-family:system-ui}.top{padding:18px 30px;border-bottom:1px solid #dfe2d7}ytd-browse{display:block}#primary{max-width:1500px;margin:auto}</style><div class="top">YouTube · Intent preview — synthetic recommendations, actual packaged model</div><ytd-browse page-subtype="home"><div id="primary"><ytd-rich-grid-renderer id="native">Original unrelated recommendations</ytd-rich-grid-renderer></div></ytd-browse>'});
  });
  await context.route('https://i.ytimg.com/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#d8dfc8"/><circle cx="490" cy="230" r="160" fill="#c0cdae"/><path d="M60 240h220M60 190h150" stroke="#718465" stroke-width="12" stroke-linecap="round"/></svg>'}));
  const ext=await context.newPage();await ext.goto('chrome://extensions');await ext.locator('extensions-item').waitFor();const id=await ext.locator('extensions-item').getAttribute('id');
  const settings=await context.newPage();await settings.goto(`chrome-extension://${id}/settings.html`);await settings.getByRole('heading',{name:'Your daily budget'}).waitFor();
  console.log('PASS fresh-install settings load without warming the model manually');
  const yt=await context.newPage();await yt.goto('https://www.youtube.com/');const feed=yt.locator('#intent-home-feed');
  await yt.waitForFunction(()=>document.querySelector('#intent-home-feed')?.shadowRoot.querySelectorAll('.card').length>=12,null,{timeout:60000});
  const titles=await feed.locator('.title').allTextContents();assert.ok(titles.every(t=>t.startsWith('Ship a tiny app')));assert.equal(await yt.locator('#native').isVisible(),false);
  console.log('PASS real offscreen model and background search produce a filled semantic Work feed');
  await settings.evaluate(()=>chrome.runtime.sendMessage({type:'UPDATE_SETTINGS',patch:{mode:'music'}}));
  await yt.waitForFunction(()=>document.querySelector('#intent-home-feed')?.shadowRoot.querySelector('.title')?.textContent.startsWith('Blue notes'),null,{timeout:60000});
  assert.ok((await feed.locator('.title').allTextContents()).every(t=>t.startsWith('Blue notes')));
  console.log('PASS switching modes refreshes the filled feed using description-based semantic classification');
  await yt.screenshot({path:path.join(shots,'intent-home-feed.png'),fullPage:true});
  await settings.locator('#blocked-terms').fill('unsaved appearance draft');
  await settings.evaluate(()=>{window.draftField=document.querySelector('#blocked-terms');});
  await yt.goto('https://www.youtube.com/watch?v=M0000000000');
  const watchFeed=yt.locator('#intent-watch-feed');
  await yt.waitForFunction(()=>document.querySelector('#intent-watch-feed')?.shadowRoot.querySelectorAll('.card').length>=11,null,{timeout:60000});
  assert.ok((await watchFeed.locator('.title').allTextContents()).every(t=>t.startsWith('Blue notes')));
  assert.equal(await watchFeed.locator('[data-video-id="M0000000000"]').count(),0);
  assert.equal(await yt.locator('#native-related').isVisible(),false);assert.equal(await yt.locator('#chat').isVisible(),true);
  assert.equal(await yt.evaluate(()=>testPlayer===document.querySelector('#playing-video')&&testPlayer.currentTime===37&&playerPauses===0),true);
  assert.equal(await watchFeed.getAttribute('data-theme'),'dark');
  await settings.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
  assert.equal(await settings.locator('#blocked-terms').inputValue(),'unsaved appearance draft');
  assert.equal(await settings.evaluate(()=>draftField===document.querySelector('#blocked-terms')),true,'appearance changes preserve the current settings form and draft');
  await yt.screenshot({path:path.join(shots,'intent-watch-dark.png'),fullPage:true});
  await settings.evaluate(()=>chrome.runtime.sendMessage({type:'UPDATE_SETTINGS',patch:{mode:'work'}}));
  await yt.waitForFunction(()=>document.querySelector('#intent-watch-feed')?.shadowRoot.querySelector('.title')?.textContent.startsWith('Ship a tiny app'),null,{timeout:60000});
  assert.ok((await watchFeed.locator('.title').allTextContents()).every(t=>t.startsWith('Ship a tiny app')));
  assert.equal(await yt.evaluate(()=>testPlayer===document.querySelector('#playing-video')&&testPlayer.currentTime===37&&playerPauses===0),true);
  await yt.evaluate(()=>document.documentElement.removeAttribute('dark'));
  await yt.waitForFunction(()=>document.querySelector('#intent-watch-feed')?.dataset.theme==='light');
  await settings.waitForFunction(()=>document.documentElement.dataset.theme==='light');
  assert.equal(await settings.locator('#blocked-terms').inputValue(),'unsaved appearance draft');
  await yt.screenshot({path:path.join(shots,'intent-watch-light.png'),fullPage:true});
  await settings.evaluate(()=>chrome.runtime.sendMessage({type:'UPDATE_SETTINGS',patch:{mode:'off'}}));
  await watchFeed.waitFor({state:'detached'});assert.equal(await yt.locator('#native-related').isVisible(),true);
  await settings.evaluate(()=>chrome.runtime.sendMessage({type:'UPDATE_SETTINGS',patch:{mode:'music'}}));
  await yt.waitForFunction(()=>document.querySelector('#intent-watch-feed')?.shadowRoot.querySelectorAll('.card').length>=11,null,{timeout:60000});
  console.log('PASS real installed extension replaces watch recommendations, excludes current video, follows YouTube appearance and preserves playback during mode changes');
  const worker=context.serviceWorkers()[0];assert.ok(worker);
  await worker.evaluate(()=>{days[IntentCore.dayKey()]=60000;});
  await settings.evaluate(()=>chrome.runtime.sendMessage({type:'UPDATE_SETTINGS',patch:{dailyMinutes:1}}));
  await yt.getByRole('heading',{name:'There’s a whole world'}).waitFor();assert.equal(yt.url(),`chrome-extension://${id}/blocked.html`);
  const newTab=await context.newPage();await newTab.goto('https://www.youtube.com/').catch(error=>{if(!error.message.includes('ERR_ABORTED'))throw error;});await newTab.getByRole('heading',{name:'There’s a whole world'}).waitFor();assert.equal(newTab.url(),`chrome-extension://${id}/blocked.html`);
  console.log('PASS real exhaustion redirects existing tabs and DNR redirects new visits');
  await settings.evaluate(()=>chrome.runtime.sendMessage({type:'UPDATE_SETTINGS',patch:{dailyMinutes:60}}));
  await newTab.goto('https://www.youtube.com/');await newTab.locator('#intent-home-feed').waitFor();
  console.log('PASS increasing the budget removes the real network block');
 }finally{await context.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
