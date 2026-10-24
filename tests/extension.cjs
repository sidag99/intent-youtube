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
   if(url.pathname==='/watch'){const id=url.searchParams.get('v');return route.fulfill({contentType:'text/html',body:'<script>var ytInitialPlayerResponse = '+JSON.stringify({videoDetails:{videoId:id,title:ids[id]?.title,shortDescription:ids[id]?.description}})+';</script>'});}
   return route.fulfill({contentType:'text/html',body:'<!doctype html><style>body{margin:0;background:#f8f8f2;color:#283b30;font-family:system-ui}.top{padding:18px 30px;border-bottom:1px solid #dfe2d7}ytd-browse{display:block}#primary{max-width:1500px;margin:auto}</style><div class="top">YouTube · Intent preview — synthetic recommendations, actual packaged model</div><ytd-browse page-subtype="home"><div id="primary"><ytd-rich-grid-renderer id="native">Original unrelated recommendations</ytd-rich-grid-renderer></div></ytd-browse>'});
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
  const worker=context.serviceWorkers()[0];assert.ok(worker);
  await worker.evaluate(()=>{days[IntentCore.dayKey()]=60000;});
  await settings.evaluate(()=>chrome.runtime.sendMessage({type:'UPDATE_SETTINGS',patch:{dailyMinutes:1}}));
  await yt.waitForURL(`chrome-extension://${id}/blocked.html`);await yt.getByRole('heading',{name:'There’s a whole world'}).waitFor();
  const newTab=await context.newPage();await newTab.goto('https://www.youtube.com/').catch(error=>{if(!error.message.includes('ERR_ABORTED'))throw error;});await newTab.waitForURL(`chrome-extension://${id}/blocked.html`);
  console.log('PASS real exhaustion redirects existing tabs and DNR redirects new visits');
  await settings.evaluate(()=>chrome.runtime.sendMessage({type:'UPDATE_SETTINGS',patch:{dailyMinutes:60}}));
  await newTab.goto('https://www.youtube.com/');await newTab.locator('#intent-home-feed').waitFor();
  console.log('PASS increasing the budget removes the real network block');
 }finally{await context.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
