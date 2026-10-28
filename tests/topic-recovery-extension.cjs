// Installed-extension recovery with real messaging and the bundled model after one controlled failure.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.resolve(__dirname,'..'),id='T0000000001',url='https://www.youtube.com/watch?v='+id;
const details={videoId:id,title:'Blue notes after midnight',author:'Evening Sessions',shortDescription:'A mellow trio with double bass, brushed drums, and saxophone.',keywords:['jazz','musical performance']};
(async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'intent-topic-recovery-'));
 let context;
 try{
  context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:['--load-extension='+root],viewport:{width:1280,height:900}});
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  await worker.evaluate(async id=>{
   await tick({type:'UPDATE_SETTINGS',patch:{mode:'music',countModes:{music:false},matchOnlyModes:{music:true},limitEnabled:true,dailyMinutes:60}},{url:chrome.runtime.getURL('settings.html')});
   const send=chrome.runtime.sendMessage.bind(chrome.runtime);
   globalThis.__topicRecoveryCalls=0;
   chrome.runtime.sendMessage=(message,...rest)=>{
    if(message.type==='AI_CLASSIFY'&&message.videos?.length===1&&message.videos[0].id===id){
     __topicRecoveryCalls++;
     if(__topicRecoveryCalls===1)return Promise.resolve({ok:false,error:'Controlled first topic-model failure'});
    }
    return send(message,...rest);
   };
  },id);
  const errors=[],external=[];
  await context.route('https://www.youtube.com/**',route=>{
   if(route.request().isNavigationRequest())return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><style>body{font:16px Arial;margin:32px}h1{font-size:24px}</style></head><body><ytd-watch-flexy video-id="'+id+'"><main id="primary"><ytd-player><video></video></ytd-player><ytd-watch-metadata><h1>'+details.title+'</h1><div id="channel-name"><a>'+details.author+'</a></div><div id="description">'+details.shortDescription+'</div></ytd-watch-metadata></main></ytd-watch-flexy><script>var ytInitialPlayerResponse='+JSON.stringify({videoDetails:details})+';</script></body></html>'});
   external.push(route.request().url());return route.abort();
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.locator('#intent-video-topic[data-state="unavailable"]').waitFor({timeout:30000});
  assert.match(await page.locator('#intent-video-topic').textContent(),/^Topic unavailable/);
  const state=()=>worker.evaluate(async url=>{const tab=(await chrome.tabs.query({url}))[0];return stateFor(tab.id);},url);
  const failed=await state();assert.equal(failed.timerTopicState,'unavailable');assert.equal(failed.timerExempt,true);assert.equal(failed.tabCounting,false);
  await page.waitForTimeout(700);assert.equal(await worker.evaluate(()=>__topicRecoveryCalls),1,'DOM updates and heartbeats never auto-retry a failed model');
  await page.getByRole('button',{name:'Retry topic check',exact:true}).click();
  await page.locator('#intent-video-topic[data-state="matching"]').waitFor({timeout:90000});
  assert.equal(await page.locator('#intent-video-topic').textContent(),'Topic: Music');
  assert.equal(await page.getByRole('button',{name:'Retry topic check',exact:true}).count(),0);
  const recovered=await state();assert.equal(recovered.timerTopicState,'matching');assert.equal(recovered.timerExempt,true);assert.equal(recovered.tabCounting,false);
  assert.equal(await worker.evaluate(()=>__topicRecoveryCalls),2,'one explicit retry reaches real bundled inference');
  await page.waitForTimeout(400);assert.equal(await worker.evaluate(()=>__topicRecoveryCalls),2,'recovered estimates are reused');
  assert.deepEqual(external,[],'current-video topics use no public page fetch or remote model download');assert.deepEqual(errors,[]);
  fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
  await page.screenshot({path:path.join(root,'test-results/topic-recovery-installed.png')});
  fs.writeFileSync(path.join(root,'test-results/topic-recovery-installed.json'),JSON.stringify({failure:{status:failed.videoTopic.status,timerExempt:failed.timerExempt},recovery:{status:recovered.videoTopic.status,categoryId:recovered.videoTopic.categoryId,timerExempt:recovered.timerExempt},modelCalls:2,externalRequests:external,errors},null,2));
  console.log('PASS installed topic failure → unavailable → explicit retry → real bundled-model recovery; timer safety, messaging, local assets and no retry loop');
 }finally{await context?.close();fs.rmSync(profile,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
