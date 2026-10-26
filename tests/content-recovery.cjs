const {chromium}=require('playwright');
const path=require('node:path'),fs=require('node:fs'),os=require('node:os'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const audio=Buffer.alloc(160044);audio.write('RIFF');audio.writeUInt32LE(audio.length-8,4);audio.write('WAVE',8);audio.write('fmt ',12);audio.writeUInt32LE(16,16);audio.writeUInt16LE(1,20);audio.writeUInt16LE(1,22);audio.writeUInt32LE(8000,24);audio.writeUInt32LE(16000,28);audio.writeUInt16LE(2,32);audio.writeUInt16LE(16,34);audio.write('data',36);audio.writeUInt32LE(audio.length-44,40);
const fixture=`<!doctype html><html dark><meta charset="utf-8"><style>html{--yt-spec-base-background:#0f0f0f;--yt-spec-text-primary:#f1f1f1;--yt-spec-text-secondary:#aaa}body{margin:0;background:#0f0f0f;color:#f1f1f1;font-family:Arial}ytd-masthead{display:flex;height:56px;padding:0 16px;gap:24px;align-items:center}#start{flex:0 0 169px}#center{display:flex;flex:1;max-width:728px;margin:auto;min-width:0}#search{display:flex;flex:1}input{width:100%}#end{flex:0 0 80px}ytd-watch-flexy{display:block;padding:24px}video{display:block;width:640px;height:360px;background:#202020}ytd-guide-entry-renderer{display:block}</style><ytd-masthead><div id="start">YouTube</div><div id="center"><form id="search"><input aria-label="Search"></form></div><div id="end">Account</div></ytd-masthead><nav><ytd-guide-entry-renderer is-primary id="shorts-nav"><a id="endpoint" title="Shorts" role="link">Shorts</a></ytd-guide-entry-renderer><a href="/">Home</a></nav><ytd-watch-flexy video-id="abcdefghijk"><div id="player"><video muted autoplay loop src="data:audio/wav;base64,${audio.toString('base64')}"></video></div><p>Native playback stays in place while Intent reconnects.</p></ytd-watch-flexy><script>window.originalPlayer=document.querySelector('video');window.mediaEvents={pause:0,emptied:0,loadstart:0};for(const name of Object.keys(mediaEvents))originalPlayer.addEventListener(name,()=>mediaEvents[name]++);originalPlayer.play().catch(()=>{});</script></html>`;
(async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'intent-recovery-'));
 const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:[`--load-extension=${root}`,'--autoplay-policy=no-user-gesture-required'],viewport:{width:1920,height:1000}});
 context.setDefaultTimeout(15000);
 const errors=[];context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
 try{
  await context.route('https://www.youtube.com/**',route=>route.fulfill({contentType:'text/html',body:fixture}));
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  const extensionId=new URL(worker.url()).host;
  await worker.evaluate(async()=>{await initialize();await tick({type:'UPDATE_SETTINGS',patch:{mode:'music',limitEnabled:false}},{url:chrome.runtime.getURL('settings.html')});});
  const page=await context.newPage();await page.goto('https://www.youtube.com/watch?v=abcdefghijk');
  await page.locator('#intent-toolbar').waitFor();
  await page.waitForFunction(()=>document.documentElement.hasAttribute('data-intent-content-owner')&&!document.querySelector('video').paused&&document.querySelector('video').currentTime>.1);
  const tabId=await worker.evaluate(async()=> (await chrome.tabs.query({url:'https://www.youtube.com/watch?v=abcdefghijk'}))[0].id);
  const owner=()=>page.locator('html').getAttribute('data-intent-content-owner');
  const initialOwner=await owner();
  await page.evaluate(()=>{window.mediaBaseline={...mediaEvents};window.documentLoads=1;window.initialToolbar=document.querySelector('#intent-toolbar');});
  const isolated=fn=>worker.evaluate(async({tabId,fn})=>(await chrome.scripting.executeScript({target:{tabId,frameIds:[0]},world:'ISOLATED',func:new Function(`return (${fn})()`) }))[0].result,{tabId,fn:fn.toString()});
  await isolated(()=>{
   const registrations=[];const add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener;
   EventTarget.prototype.addEventListener=function(type,callback,options){if(this===document||this===window)registrations.push({target:this,type,callback,capture:typeof options==='boolean'?options:!!options?.capture});return add.call(this,type,callback,options);};
   EventTarget.prototype.removeEventListener=function(type,callback,options){const capture=typeof options==='boolean'?options:!!options?.capture;for(let index=registrations.length-1;index>=0;index--)if(registrations[index].target===this&&registrations[index].type===type&&registrations[index].callback===callback&&registrations[index].capture===capture)registrations.splice(index,1);return remove.call(this,type,callback,options);};
   const activeIntervals=new Set(),interval=setInterval,clear=clearInterval;
   globalThis.setInterval=(...args)=>{const id=interval(...args);activeIntervals.add(id);return id;};globalThis.clearInterval=id=>{activeIntervals.delete(id);return clear(id);};
   globalThis.recoverySnapshot=()=>({listeners:registrations.map(item=>`${item.target===document?'document':'window'}:${item.type}`).sort(),intervals:activeIntervals.size});
  });
  const replace=()=>worker.evaluate(async tabId=>{await chrome.scripting.executeScript({target:{tabId,frameIds:[0]},files:chrome.runtime.getManifest().content_scripts[0].js,world:'ISOLATED'});},tabId);
  await replace();await page.waitForFunction(old=>document.documentElement.getAttribute('data-intent-content-owner')!==old&&document.querySelectorAll('#intent-toolbar').length===1,initialOwner);
  assert.equal(await page.evaluate(()=>initialToolbar.isConnected),false,'the replaced toolbar is detached');
  const first=await isolated(()=>recoverySnapshot()),secondOwner=await owner();
  assert.ok(first.listeners.length>0);assert.ok(first.intervals>0);
  await replace();await page.waitForFunction(old=>document.documentElement.getAttribute('data-intent-content-owner')!==old&&document.querySelectorAll('#intent-toolbar').length===1,secondOwner);
  assert.deepEqual(await isolated(()=>recoverySnapshot()),first,'replacement removes old document/window listeners and heartbeat intervals');
  const freshOwner=await owner();await page.waitForTimeout(2200);
  assert.equal(await owner(),freshOwner,'an old delayed cleanup cannot erase the fresh controller owner');
  assert.equal(await page.locator('#intent-toolbar').count(),1);assert.equal(await page.locator('#shorts-nav').isVisible(),false);
  await isolated(()=>document.dispatchEvent(new Event('intent-context-lost')));
  await page.locator('#intent-toolbar').waitFor({state:'detached'});
  assert.deepEqual(await isolated(()=>recoverySnapshot()),{listeners:[],intervals:0},'explicit context loss disposes all tracked controller listeners and intervals');
  assert.equal(await page.locator('#shorts-nav').isVisible(),true,'disposal restores owned native navigation');
  assert.equal(await worker.evaluate(tabId=>reconnectService.activate({tabId}),tabId),true);
  await page.locator('#intent-toolbar').waitFor();assert.equal(await page.locator('#intent-toolbar').count(),1);
  const beforeReload=await owner();
  console.log('PASS repeated controller replacement and explicit invalid-context disposal; single controller and native playback preserved');

  // An inactive tab is intentionally skipped on extension installation. Its old
  // controller detects the truly invalidated runtime before the later activation.
  const manager=await context.newPage();await manager.goto('chrome://extensions');await manager.bringToFront();
  const developerToggle=manager.locator('extensions-toolbar #devMode');
  if(await developerToggle.getAttribute('aria-pressed')!=='true'&&await developerToggle.getAttribute('checked')===null)await developerToggle.click();
  const extension=manager.locator(`extensions-item[id="${extensionId}"]`);
  await extension.waitFor();
  let reloaded;context.on('serviceworker',candidate=>{if(candidate!==worker&&candidate.url().includes(extensionId))reloaded=candidate;});
  await extension.locator('#dev-reload-button').click();
  await page.locator('#intent-toolbar').waitFor({state:'detached',timeout:12000});
  assert.equal(await page.locator('#shorts-nav').isVisible(),true);
  await page.bringToFront();
  await page.locator('#intent-toolbar').waitFor({timeout:15000});
  reloaded ||= context.serviceWorkers().find(candidate=>candidate!==worker&&candidate.url().includes(extensionId));
  assert.ok(reloaded,'extension activation starts a new service worker');
  await page.waitForFunction(old=>document.documentElement.getAttribute('data-intent-content-owner')!==old,beforeReload);
  assert.equal(await page.locator('#intent-toolbar').count(),1);
  const ping=await reloaded.evaluate(tabId=>chrome.tabs.sendMessage(tabId,{type:'INTENT_PING'},{frameId:0}),tabId);
  assert.deepEqual(ping,{ok:true,contextValid:true});
  const after=await owner();await page.waitForTimeout(2200);assert.equal(await owner(),after);
  assert.equal(await page.locator('#shorts-nav').isVisible(),false);
  const media=await page.evaluate(()=>({same:document.querySelector('video')===originalPlayer,paused:originalPlayer.paused,events:mediaEvents,baseline:mediaBaseline,url:location.href}));
  assert.equal(media.same,true);assert.equal(media.paused,false);assert.deepEqual(media.events,media.baseline,'recovery must not pause, reset or reload native video');
  assert.equal(media.url,'https://www.youtube.com/watch?v=abcdefghijk');
  assert.deepEqual(errors,[],'invalidated extension contexts are handled without uncaught page errors');
  const shots=path.resolve(process.env.INTENT_SCREENSHOTS||path.join(root,'test-results'));fs.mkdirSync(shots,{recursive:true});await page.screenshot({path:path.join(shots,'intent-content-recovered.png')});
  console.log('PASS actual Chrome extension Reload followed by activation recovery; live PING, unchanged video, fresh ownership and no uncaught errors');
 }finally{await context.close();fs.rmSync(profile,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
