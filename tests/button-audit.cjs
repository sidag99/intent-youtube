const {chromium}=require('playwright');
const assert=require('assert/strict'),path=require('path'),fs=require('fs');
const root=path.resolve(__dirname,'..'),shots=path.resolve(process.env.INTENT_SCREENSHOTS||'test-results');fs.mkdirSync(shots,{recursive:true});
// Check final painted foreground/background contrast rather than token names.
async function inspect(page,selector=null){return page.evaluate(selector=>{
 const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d',{willReadFrequently:true});
 const luminance=rgb=>Array.from(rgb).slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
 const scope=selector?document.querySelector(selector).shadowRoot:document;
 return [...scope.querySelectorAll('button,a.button,a.youtube-link,a.all-settings,a.quiet-link')].filter(el=>{const r=el.getBoundingClientRect();return r.width&&r.height&&getComputedStyle(el).visibility!=='hidden';}).map(el=>{
  const s=getComputedStyle(el),r=el.getBoundingClientRect(),ancestors=[];for(let p=el;p;p=p.parentElement||p.getRootNode()?.host)ancestors.unshift(p);
  ctx.fillStyle='#fff';ctx.fillRect(0,0,1,1);for(const parent of ancestors){ctx.fillStyle=getComputedStyle(parent).backgroundColor;ctx.fillRect(0,0,1,1);if(parent.classList.contains('mode-tile')){ctx.fillStyle=getComputedStyle(parent.querySelector('.mode')).backgroundColor;ctx.fillRect(0,0,1,1);}}
  const bg=luminance(ctx.getImageData(0,0,1,1).data);ctx.fillStyle=s.color;ctx.fillRect(0,0,1,1);const fg=luminance(ctx.getImageData(0,0,1,1).data);
  return {id:el.id,label:el.textContent.trim(),classes:el.className,disabled:el.matches(':disabled'),width:r.width,height:r.height,font:parseFloat(s.fontSize),weight:s.fontWeight,border:s.borderTopWidth,borderStyle:s.borderTopStyle,background:s.backgroundColor,color:s.color,contrast:(Math.max(bg,fg)+.05)/(Math.min(bg,fg)+.05)};
 });
},selector);}
let minimumContrast=Infinity;
function assertActions(rows){for(const row of rows){if(row.disabled)continue;if(row.label){assert.ok(row.contrast>=4.5,`${row.label} contrast ${row.contrast}: ${JSON.stringify(row)}`);minimumContrast=Math.min(minimumContrast,row.contrast);}if(row.classes.split(/\s+/).some(c=>['button','text-button'].includes(c))){
 assert.ok(row.height>=39.5,`${row.label} height ${row.height}`);assert.ok(row.font>=13,`${row.label} font ${row.font}`);
 assert.ok(row.contrast>=4.5,`${row.label} contrast ${row.contrast}: ${JSON.stringify(row)}`);
 if(/\bsecondary\b|\bdanger-button\b/.test(row.classes))assert.equal(row.border,'1px',`${row.label} border`);
 }if(row.classes.includes('edit-intent'))assert.ok(row.width>=28&&row.height>=28,'edit target');}}
(async()=>{const browser=await chromium.launch({channel:'chromium',headless:true});try{
 for(const theme of ['light','dark'])for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:1100},colorScheme:theme});const page=await context.newPage();
  await page.goto('file://'+root+'/settings.html');await page.locator('#new-role-preset').waitFor();assertActions(await inspect(page));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'settings overflow');
  // The disabled model-preview action must not light up under a pointer.
  const disabled=page.locator('#preview-intent'),before=await disabled.evaluate(el=>({background:getComputedStyle(el).backgroundColor,opacity:getComputedStyle(el).opacity}));
  await disabled.hover();assert.deepEqual(await disabled.evaluate(el=>({background:getComputedStyle(el).backgroundColor,opacity:getComputedStyle(el).opacity})),before);
  await page.locator('#show-hidden').click();assert.equal(await page.locator('#show-hidden').getAttribute('aria-pressed'),'true');await page.locator('#show-hidden').hover();await page.waitForFunction(()=>!document.querySelector('#show-hidden').getAnimations().some(a=>a.playState==='running'));assertActions(await inspect(page));await page.locator('#show-hidden').click();
  await page.locator('#new-role-preset').click();assertActions(await inspect(page));await page.locator('[data-close]').click();
  await page.locator('[data-edit=work]').click();assertActions(await inspect(page));await page.keyboard.press('Tab');await page.locator('#cancel-editor').focus();assert.equal(await page.locator('#cancel-editor').evaluate(el=>getComputedStyle(el).outlineStyle),'solid');
  await page.locator('#cancel-editor').click();
  await page.locator('#reset-settings').click();const destructive=page.locator('#confirm-reset');assert.ok((await destructive.getAttribute('class')).includes('danger'));
  assertActions(await inspect(page));await destructive.hover();assertActions(await inspect(page));
  await page.screenshot({path:path.join(shots,`intent-button-reset-${theme}-${width}.png`)});await page.locator('#cancel-reset').click();
  await page.locator('#delete-role-preset').click();assert.ok((await page.locator('#confirm-delete-role-preset').getAttribute('class')).includes('danger'));assertActions(await inspect(page));await page.locator('#delete-role-preset-dialog [data-close]').click();
  await page.locator('#intent-catalogue summary').click();assertActions(await inspect(page));
  await page.locator('[data-add-template=ai]').click();await page.locator('[data-edit=custom-ai]').waitFor();
  await page.locator('[data-edit=custom-ai]').click();assert.ok((await page.locator('#delete-intent').getAttribute('class')).includes('danger-button'));assertActions(await inspect(page));await page.locator('#close-editor').click();
  await page.locator('#role-presets').screenshot({path:path.join(shots,`intent-button-presets-${theme}-${width}.png`)});
  await page.locator('#intent-preview').screenshot({path:path.join(shots,`intent-button-preview-${theme}-${width}.png`)});
  await page.goto('file://'+root+'/popup.html');await page.locator('.mode-off-button').waitFor();assertActions(await inspect(page));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'popup overflow');
  await page.screenshot({path:path.join(shots,`intent-button-popup-${theme}-${width}.png`)});await context.close();
 }
 for(const theme of ['light','dark']){
  const context=await browser.newContext({viewport:{width:1920,height:1000},colorScheme:theme});const page=await context.newPage();
  await page.route('https://www.youtube.com/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><style>body{margin:0;font:14px Arial}ytd-masthead{height:56px;display:flex;padding:0 16px;align-items:center}#start{width:170px}#center{width:640px;margin:auto;display:flex}#primary{max-width:1100px;margin:auto}#player{height:300px}</style><ytd-masthead><div id="start">YouTube</div><div id="center"><input aria-label="Search"></div></ytd-masthead>'+(route.request().url().includes('/watch')?'<ytd-watch-flexy><div id="primary"><div id="player">Playing</div></div><div id="secondary"><div id="related">Native recommendations</div></div></ytd-watch-flexy>':'<ytd-browse page-subtype="home"><div id="primary">Native recommendations</div></ytd-browse>')}));
  await page.route('https://i.ytimg.com/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="170"/>'}));
  for(const surface of ['home','watch']){
   await page.goto(surface==='home'?'https://www.youtube.com/':'https://www.youtube.com/watch?v=abcdefghijk');
   if(theme==='dark')await page.evaluate(()=>{document.documentElement.setAttribute('dark','');document.body.style.background='#0f0f0f';document.body.style.color='#f1f1f1';});
   for(const file of ['core.js','feed.js','feed-theme.js','home.js','toolbar.js'])await page.addScriptTag({path:path.join(root,'src',file)});
   await page.evaluate(surface=>{const settings=IntentCore.sanitize({metadataLimit:0});const runtime={sendMessage:async message=>({ok:true,key:message.key,items:[{id:'Z0000000001',title:'Python programming tutorial',description:'Build useful software tools',channel:'A creator'}],hasMore:true,nextCursor:1}),getURL:p=>'https://extension.test/'+p};window.home=new IntentHome(runtime,surface);home.sync(settings,true);window.toolbar=new IntentToolbar(runtime);toolbar.sync(settings);},surface);
   const host='#intent-'+surface+'-feed';await page.locator(host+' .more').waitFor();
   let rows=await inspect(page,host);for(const row of rows.filter(r=>!r.disabled&&r.label)){assert.ok(row.contrast>=4.5,'feed action contrast');minimumContrast=Math.min(minimumContrast,row.contrast);}
   const more=rows.find(r=>r.classes==='more');assert.ok(more.height>=(surface==='watch'?36:40)&&more.font>=13,'contextual recommendation action size');
   await page.locator('#intent-toolbar').getByRole('combobox',{name:'Intent mode'}).click();rows=await inspect(page,'#intent-toolbar');
   for(const row of rows.filter(r=>!r.disabled&&r.label)){assert.ok(row.contrast>=4.5,'toolbar text contrast: '+JSON.stringify(row));minimumContrast=Math.min(minimumContrast,row.contrast);if(row.classes==='option'||row.classes.includes('pause-button'))assert.ok(row.height>=44,'menu target');}
   await page.screenshot({path:path.join(shots,`intent-button-${surface}-${theme}.png`)});
  }await context.close();
 }
 const touch=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,colorScheme:'dark'}),page=await touch.newPage();await page.goto('file://'+root+'/settings.html');await page.locator('#new-role-preset').waitFor();
 const touchRows=await inspect(page);for(const row of touchRows.filter(r=>!r.disabled&&r.classes.split(/\s+/).some(c=>['button','text-button','switch'].includes(c))))assert.ok(row.height>=43.5,`${row.label||row.classes} touch target`);
 await touch.close();console.log('Minimum enabled text-action contrast: '+minimumContrast.toFixed(2)+':1');console.log('PASS button hierarchy, text contrast, borders, action sizes, disabled/hover/pressed/focus states, touch targets and light/dark desktop/narrow dialogs, settings and popup');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
