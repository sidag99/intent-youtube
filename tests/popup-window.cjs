// This owns a fresh browser/profile and opens Chrome's actual action popup.
// A normal tab at an assigned viewport cannot reproduce popup intrinsic sizing.
const {chromium}=require('playwright');
const assert=require('assert/strict'),path=require('path'),os=require('os'),fs=require('fs');
const root=path.resolve(__dirname,'..'),shots=path.resolve(process.env.INTENT_SCREENSHOTS||'test-results');fs.mkdirSync(shots,{recursive:true});
(async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'intent-popup-window-'));
 const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:['--load-extension='+root]});
 try{
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker'),id=new URL(worker.url()).host;
  const page=await context.newPage();await page.route('https://example.com/**',route=>route.fulfill({contentType:'text/html',body:'<h1>Outside YouTube</h1>'}));
  await page.route('https://www.youtube.com/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html dark><style>body{background:#0f0f0f;color:#f1f1f1}</style><ytd-search>Intent popup test</ytd-search></html>'}));
  const browserCDP=await context.browser().newBrowserCDPSession();
  async function openPopup(){
   await worker.evaluate(async()=>{await chrome.action.openPopup();});
   let target;
   for(let attempt=0;attempt<100;attempt++){
    target=(await browserCDP.send('Target.getTargets')).targetInfos.find(t=>t.url===`chrome-extension://${id}/popup.html`);
    if(target)break;await new Promise(resolve=>setTimeout(resolve,20));
   }
   assert.ok(target,'Chrome creates a real action popup target');
   const {sessionId}=await browserCDP.send('Target.attachToTarget',{targetId:target.targetId,flatten:false});let sequence=0;const pending=new Map();
   const onMessage=event=>{if(event.sessionId!==sessionId)return;const message=JSON.parse(event.message),entry=pending.get(message.id);if(!entry)return;pending.delete(message.id);clearTimeout(entry.timer);message.error?entry.reject(new Error(message.error.message)):entry.resolve(message.result);};
   browserCDP.on('Target.receivedMessageFromTarget',onMessage);
   const send=(method,params={})=>new Promise((resolve,reject)=>{const request=++sequence,timer=setTimeout(()=>{pending.delete(request);reject(new Error(method+' timed out'));},10000);pending.set(request,{resolve,reject,timer});browserCDP.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id:request,method,params})}).catch(reject);});
   return {send,close:async()=>{browserCDP.off('Target.receivedMessageFromTarget',onMessage);for(const entry of pending.values()){clearTimeout(entry.timer);entry.reject(new Error('Popup closed'));}pending.clear();await browserCDP.send('Target.closeTarget',{targetId:target.targetId});await browserCDP.send('Target.detachFromTarget',{sessionId}).catch(()=>{});}};
  }
  for(const site of ['outside','youtube']){
   await page.goto(site==='outside'?'https://example.com/':'https://www.youtube.com/results?search_query=lesson');await page.bringToFront();
   const popup=await openPopup();try{
    let result;
    for(let attempt=0;attempt<100;attempt++){
     result=(await popup.send('Runtime.evaluate',{expression:`(()=>({ready:!!document.querySelector(${JSON.stringify(site==='outside'?'.outside-youtube':'.modes-panel')}),width:innerWidth,body:document.body?.getBoundingClientRect().width,scroll:document.documentElement.scrollWidth,text:document.body?.innerText}))()`,returnByValue:true})).result.value;
     if(result.ready)break;await new Promise(resolve=>setTimeout(resolve,20));
    }
    assert.ok(result.ready,site+' popup content loads');
    // Allow Chrome to finish its native content-size negotiation, not just DOM load.
    await new Promise(resolve=>setTimeout(resolve,250));
    result=(await popup.send('Runtime.evaluate',{expression:'({width:innerWidth,body:document.body.getBoundingClientRect().width,scroll:document.documentElement.scrollWidth,html:document.documentElement.getBoundingClientRect().width,client:document.documentElement.clientWidth})',returnByValue:true})).result.value;
    assert.equal(result.body,400,site+' action popup retains its explicit body width');assert.ok(result.width>=400&&result.width<=416,site+' native viewport is stable: '+JSON.stringify(result));assert.ok(result.scroll<=result.width,site+' has no horizontal overflow');
    if(site==='youtube'){
     const read=async expression=>(await popup.send('Runtime.evaluate',{expression,returnByValue:true})).result.value;
     const until=async expression=>{for(let i=0;i<100;i++){if(await read(expression))return;await new Promise(resolve=>setTimeout(resolve,25));}throw new Error('Popup state did not settle: '+expression);};
     const grid=await read(`({columns:getComputedStyle(document.querySelector('.mode-grid')).gridTemplateColumns.split(' ').length,edit:document.querySelectorAll('.edit-intent').length,body:document.body.getBoundingClientRect().width})`);
     assert.equal(grid.columns,4,'the actual Chrome popup uses exactly four intent columns');assert.ok(grid.edit>=3);assert.equal(grid.body,400);
     await read(`document.querySelector('#popup-create-intent').click()`);await until(`document.querySelector('#intent-editor')?.open`);
     await read(`document.querySelector('#intent-name').value='Chess practice';document.querySelector('#intent-name').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#intent-description').value='Chess endgames, tactics, strategy and annotated games.';document.querySelector('#intent-description').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-icon-choice="game"]').click();`);
     await read(`document.querySelector('#rules-form button[type="submit"]').click()`);
     await until(`!document.querySelector('#intent-editor')&&[...document.querySelectorAll('.mode strong')].some(n=>n.textContent==='Chess practice')`);
     assert.equal(await worker.evaluate(()=>Object.values(settings.customIntents).some(v=>v.name==='Chess practice'&&v.icon==='game')),true,'creation from the actual popup persists name/description/icon');
     await read(`document.querySelector('#popup-intent-library').click()`);await until(`document.querySelector('#intent-library-dialog')?.open`);
     const librarySize=await read(`({body:document.body.getBoundingClientRect().width,dialog:document.querySelector('#intent-library-dialog').getBoundingClientRect().width,overflow:document.documentElement.scrollWidth>innerWidth})`);
     assert.equal(librarySize.body,400);assert.ok(librarySize.dialog<=400&&!librarySize.overflow,'library stays within the native popup');
     await read(`document.querySelector('#template-search').value='backpacking';document.querySelector('#template-search').dispatchEvent(new Event('input',{bubbles:true}));`);
     assert.equal(await read(`document.querySelector('[data-template="travel"]').hidden`),false,'library search finds added topic keywords');
     await read(`document.querySelector('[data-add-template="travel"]').click()`);await until(`document.querySelector('[data-add-template="travel"]')?.textContent==='Added'`);
     assert.equal(await worker.evaluate(()=>Object.values(settings.customIntents).some(v=>v.templateId==='travel')),true,'library installation persists from the actual popup');
     await read(`document.querySelector('#close-intent-library').click()`);await until(`!document.querySelector('#intent-library-dialog').open`);
     assert.equal(await read(`document.querySelectorAll('.mode-grid .mode').length`),5);assert.equal(await read(`document.body.getBoundingClientRect().width`),400);
     // Creation and library never route the user to another settings tab.
     assert.equal((await context.pages()).filter(page=>page.url().endsWith('/settings.html')).length,0);
     await read('window.scrollTo(0,0)');
     const panelRect=await read(`(()=>{const r=document.querySelector('.modes-panel').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,scale:1};})()`);
     const panelShot=await popup.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:panelRect});fs.writeFileSync(path.join(shots,'intent-popup-intent-actions.png'),Buffer.from(panelShot.data,'base64'));
     console.log('PASS actual popup four-column grid, custom creation, shared icons, keyword-searchable library installation and bounded modal width');
    }
    const screenshot=await popup.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(shots,`intent-native-popup-${site}.png`),Buffer.from(screenshot.data,'base64'));
    console.log('PASS actual Chrome action popup '+site+' '+JSON.stringify(result));
   }finally{await popup.close();}
  }
  await browserCDP.detach();
 }finally{await context.close();fs.rmSync(profile,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1});
