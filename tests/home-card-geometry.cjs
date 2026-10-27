const {chromium}=require('playwright');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({channel:'chromium',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:2200,height:1000}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://www.youtube.com/**',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="en"><style>
  *{box-sizing:border-box}body{margin:0;font-family:Arial;--ytd-rich-grid-items-per-row:4;--ytd-rich-grid-item-margin:16px;--ytd-rich-grid-item-max-width:500px}ytd-browse,ytd-rich-grid-renderer,ytd-rich-item-renderer,ytd-rich-grid-media,yt-lockup-view-model,ytd-thumbnail{display:block}#primary{width:calc(100% - 48px);margin:auto}ytd-rich-grid-renderer{padding:0 24px;--ytd-rich-grid-items-per-row:4;--ytd-rich-grid-item-margin:16px;--ytd-rich-grid-item-max-width:500px}#native-contents{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:32px 16px}ytd-rich-item-renderer>#content{display:flex;width:calc((100% + var(--ytd-rich-grid-item-margin))/var(--ytd-rich-grid-items-per-row) - var(--ytd-rich-grid-item-margin))}ytd-rich-grid-media,yt-lockup-view-model{width:100%;max-width:var(--ytd-rich-grid-item-max-width)}ytd-thumbnail,.ytLockupViewModelContentImage{display:block;width:100%;aspect-ratio:16/9;background:#456}#native-contents #content{width:100%}#native-contents ytd-rich-grid-media,#native-contents yt-lockup-view-model{max-width:none}h3{margin:8px 0;font-size:16px}@media(max-width:1100px){#native-contents{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:650px){#native-contents{grid-template-columns:minmax(0,1fr)}}
  </style><ytd-browse page-subtype="home"><main id="primary"><ytd-rich-grid-renderer><div id="native-contents"></div></ytd-rich-grid-renderer></main></ytd-browse></html>`}));
  await page.goto('https://www.youtube.com/');
  for(const name of ['core.js','feed.js','feed-theme.js','native-cards.js','home.js'])await page.addScriptTag({path:path.join(root,'src',name)});
  await page.addStyleTag({path:path.join(root,'src/content.css')});
  await page.evaluate(()=>{
   document.documentElement.setAttribute('data-intent-native-components','ytd-rich-item-renderer');
   window.frames=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   window.makeNative=(index)=>{
    const card=document.createElement('ytd-rich-item-renderer'),content=document.createElement('div'),modern=index%2===0,media=document.createElement(modern?'yt-lockup-view-model':'ytd-rich-grid-media'),thumb=document.createElement(modern?'a':'ytd-thumbnail'),title=document.createElement('h3');
    content.id='content';if(modern)thumb.className='ytLockupViewModelContentImage';const link=document.createElement('a');link.href='/watch?v=V'+String(index).padStart(10,'0');link.textContent='Useful video '+index;title.append(link);media.append(thumb,title);content.append(media);card.append(content);card.dataset.index=index;return card;
   };
   window.setup=()=>{window.sources=Array.from({length:6},(_,index)=>makeNative(index));document.querySelector('#native-contents').replaceChildren(...sources);};
   window.readOriginal=()=>sources.map(node=>{const r=node.querySelector('ytd-thumbnail,.ytLockupViewModelContentImage').getBoundingClientRect();return{x:r.x,width:r.width};});
   window.activate=()=>{
    window.home=new IntentHome({sendMessage:async()=>({ok:true})});home.create();document.querySelector('#primary').prepend(home.host);home.matchHomeGrid(document.querySelector('#primary'));home.nativeCards=new IntentNativeCards(home.host,'home');home.recommendedSection.hidden=false;
    for(let index=0;index<12;index++){
     const card=document.createElement('article');card.className='card';const fallback=document.createElement('span');fallback.textContent='Fallback';card.append(fallback);
     const original=index<6?sources[index]:null;home.nativeCards.enhance(card,{id:'V'+String(index).padStart(10,'0'),title:'Useful video '+index},original);
     if(!original){const entry=home.nativeCards.entries.get('V'+String(index).padStart(10,'0'));entry.node.append(makeNative(index));home.nativeCards.reveal(entry);}
     (index<6?home.recommendedGrid:home.grid).append(card);
    }
   };
   window.readActive=()=>({metrics:home.homeGridMetrics,groups:[home.recommendedGrid,home.grid].map(grid=>[...grid.querySelectorAll('.card')].map(card=>{const slot=card.querySelector('slot'),owner=slot.assignedElements()[0],thumb=owner.querySelector('ytd-thumbnail,.ytLockupViewModelContentImage'),r=thumb.getBoundingClientRect(),outer=card.getBoundingClientRect();return{x:r.x,width:r.width,outerWidth:outer.width};}))});
  });
  for(const viewport of [2200,1400,1000,600]){
   await page.setViewportSize({width:viewport,height:1000});await page.evaluate(async()=>{setup();await frames();});
   const before=await page.evaluate(()=>readOriginal());
   await page.evaluate(async()=>{activate();await frames();});
   const active=await page.evaluate(()=>readActive()),columns=viewport>1100?3:viewport>650?2:1;
   assert.equal(active.metrics.columns,columns,`${viewport}: actual native tracks win over stale four-column variable`);
   assert.equal(active.metrics.gap,16,`${viewport}: native gap preserved`);assert.equal(active.metrics.start,24);assert.equal(active.metrics.end,24);
   for(const group of active.groups)for(let index=0;index<group.length;index++){
    assert.ok(Math.abs(group[index].width-group[index].outerWidth)<1,`${viewport}: both native variants fill the assigned track`);
    assert.ok(Math.abs(group[index].width-before[index].width)<1,`${viewport}: generated and moved thumbnails match native width`);
    assert.ok(Math.abs(group[index].x-before[index].x)<1,`${viewport}: generated and moved thumbnails match native margin/gap`);
   }
   if(viewport===2200)assert.ok(active.groups[1][0].width>500,'large native cards are not capped at legacy media max-width');
   if(viewport===2200){
    await page.setViewportSize({width:1000,height:1000});
    await page.evaluate(async()=>{await frames();home.matchHomeGrid(document.querySelector('#primary'));await frames();});
    const resized=await page.evaluate(()=>readActive());assert.equal(resized.metrics.columns,2,'active resize reads current native tracks after source cards move');
    assert.ok(resized.groups.flat().every(card=>Math.abs(card.width-444)<1&&Math.abs(card.width-card.outerWidth)<1),'active resize preserves native two-column width rather than stale oversized tracks');
    await page.setViewportSize({width:viewport,height:1000});await page.evaluate(async()=>{await frames();home.matchHomeGrid(document.querySelector('#primary'));await frames();});
   }
   // The measured geometry remains available after all original source cards move.
   await page.evaluate(()=>home.matchHomeGrid(document.querySelector('#primary')));
   assert.deepEqual(await page.evaluate(()=>readActive()),active,`${viewport}: empty source retains measured spacing`);
   await page.evaluate(async()=>{home.destroy();await frames();});
   assert.deepEqual(await page.evaluate(()=>readOriginal()),before,`${viewport}: Off/Pause restoration returns exact native geometry`);
   assert.equal(await page.locator('#native-contents>ytd-rich-item-renderer').count(),6);assert.equal(await page.locator('[data-intent-native-card]').count(),0);
  }
  assert.deepEqual(errors,[]);await context.close();
  console.log('PASS Home legacy/modern native thumbnails fill tracks, match native columns/gaps/insets at wide and narrow widths, retain empty-source measurements, and restore on Off/Pause');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
