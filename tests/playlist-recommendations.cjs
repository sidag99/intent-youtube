// UI/protocol regression with an explicit deterministic classifier double.
// This verifies playlist transport/rendering/restoration, not model accuracy.
const {chromium}=require('playwright');
const path=require('node:path'),assert=require('node:assert/strict'),fs=require('node:fs');
const root=path.resolve(__dirname,'..'),current='C0000000000',other='V0000000001';
(async()=>{
 const browser=await chromium.launch({channel:'chromium',headless:true});
 const context=await browser.newContext({viewport:{width:1920,height:1100},serviceWorkers:'block'});context.setDefaultTimeout(10000);
 const page=await context.newPage(),errors=[],network=[];page.on('pageerror',error=>errors.push(error.message));
 try{
  await page.route('**/*',route=>{
   if(route.request().isNavigationRequest())return route.fulfill({contentType:'text/html',body:`<!doctype html><html><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;font-family:Arial}ytd-masthead{display:flex;height:56px;padding:0 16px;gap:24px;align-items:center}#start{flex:0 0 169px}#center{display:flex;flex:1;max-width:728px;margin:auto;min-width:0}#search{display:flex;flex:1}#search input{width:100%;min-width:0}#end{flex:0 0 80px}ytd-watch-flexy{display:grid;grid-template-columns:minmax(0,1fr) 470px;padding:24px;gap:24px}#playing-video{width:100%;height:340px;background:#123}ytd-compact-playlist-renderer,ytd-compact-radio-renderer,yt-lockup-view-model,ytd-compact-video-renderer,ytd-grid-playlist-renderer{display:block;padding:8px;border:1px solid #ddd;margin-bottom:10px}img{width:168px;height:94px;object-fit:cover}h3{font-size:16px;margin:5px 0}a{color:#111}</style><ytd-masthead><div id="start">YouTube</div><div id="center"><form id="search"><input aria-label="Search"></form></div><div id="end">Account</div></ytd-masthead><ytd-watch-flexy video-id="${current}"><main><video id="playing-video"></video><p>The current native player stays in place.</p></main><aside id="secondary"><div id="related"><div id="native-owner" style="position:relative;opacity:.93;max-width:470px" aria-hidden="false"></div></div></aside></ytd-watch-flexy></html>`});
   if(route.request().url().startsWith('https://i.ytimg.com/'))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#456"/></svg>'});
   network.push(route.request().url());return route.abort();
  });
  await page.goto('https://www.youtube.com/watch?v='+current);
  await page.evaluate(({current,other})=>{
   for(const tag of ['ytd-compact-playlist-renderer','ytd-compact-radio-renderer','yt-lockup-view-model','ytd-compact-video-renderer'])customElements.define(tag,class extends HTMLElement{});
   const specs=[
    ['current-list','ytd-compact-playlist-renderer','/watch?v='+current+'&list=PL_CURRENT&index=4','Jazz collection beginning with this video','music'],
    ['radio','ytd-compact-radio-renderer','/watch?v='+current+'&list=RD'+current,'Jazz mix from this performance','music'],
    ['modern-list','yt-lockup-view-model','/watch?v='+other+'&list=PL_MODERN','Instrumental jazz anthology','music'],
    ['standalone','ytd-compact-video-renderer','/watch?v='+other,'An individual saxophone performance','music'],
    ['current-single','ytd-compact-video-renderer','/watch?v='+current,'The video already playing','music'],
    ['pure-list','ytd-compact-playlist-renderer','/playlist?list=PL_ONLY','Evening performances playlist','music'],
    ['unrelated','ytd-compact-playlist-renderer','/watch?v='+other+'&list=PL_COMEDY','Comedy television episodes','television'],
    ['fallback-list','ytd-grid-playlist-renderer','/watch?v='+other+'&list=PL_FALLBACK&index=9&start_radio=1&tracking=untrusted','Guitar recordings playlist','music'],
    ['fallback-only','ytd-grid-playlist-renderer','/playlist?list=PL_FALLBACK_ONLY&url=https%3A%2F%2Fattacker.example&tracking=untrusted','Piano albums playlist','music']
   ];
   window.originals=new Map();window.controllers=new WeakMap();window.nativePlayer=document.querySelector('#playing-video');
   const owner=document.querySelector('#native-owner');
   for(const [id,tag,href,title,topic]of specs){
    const card=document.createElement(tag);card.id=id;
    if(id==='current-list')card.style.cssText='display:flex!important;width:333px;min-width:111px;max-width:444px;margin:3px 7px;color:rgb(20, 30, 40)';
    const thumb=document.createElement('a');thumb.href=href;const image=document.createElement('img');image.src='https://i.ytimg.com/vi/'+other+'/hqdefault.jpg';thumb.append(image);
    const heading=document.createElement('h3'),titleLink=document.createElement('a');titleLink.id='video-title';titleLink.href=href;titleLink.textContent=title;heading.append(titleLink);
    const channel=document.createElement('div');channel.id='channel-name';channel.textContent='Example '+topic+' archive';
    const description=document.createElement('div');description.id='description-text';description.textContent=topic==='music'?'Instrumental performances by a jazz ensemble.':'A television comedy anthology.';
    const button=document.createElement('button');button.type='button';button.textContent='Native list menu';
    const controller={clicks:0,secret:'original-controller-'+id};controllers.set(card,controller);button.addEventListener('click',()=>controller.clicks++);
    card.data={navigationEndpoint:{urlEndpoint:{url:'https://attacker.example/do-not-copy'}},privateTracking:'do-not-copy'};
    card.append(thumb,heading,channel,description,button);owner.append(card);originals.set(id,card);
   }
   window.readRestoration=()=>{
    const styles=node=>Object.fromEntries([...node.style].sort().map(name=>[name,[node.style.getPropertyValue(name),node.style.getPropertyPriority(name)]]));
    return {order:[...owner.children].map(node=>node.id),ownerStyles:styles(owner),ownerAria:owner.getAttribute('aria-hidden'),ownerInert:owner.hasAttribute('inert'),cards:[...originals].map(([id,node])=>({id,same:document.getElementById(id)===node,parent:node.parentElement?.id,style:styles(node),hadStyle:node.hasAttribute('style'),controller:controllers.get(node).secret}))};
   };
   window.originalSnapshot=readRestoration();window.requests=[];window.messageListeners=new Set();
   window.chrome={runtime:{id:'fixture',getURL:file=>'https://extension.fixture/'+file,onMessage:{addListener:listener=>messageListeners.add(listener),removeListener:listener=>messageListeners.delete(listener)},sendMessage:async message=>{
    requests.push(structuredClone(message));
    if(message.type==='SET_MODE')fixtureSettings=IntentCore.sanitize({...fixtureSettings,mode:message.mode});
    if(message.type==='SET_TAB_PAUSED')fixturePaused=message.paused===true;
    if(message.type==='FILTER_RECOMMENDATIONS'){
     // Deliberately explicit classifier double: only our synthetic music channel
     // is accepted. No inference or actual model accuracy is claimed here.
     const items=message.videos.filter(video=>video.channel==='Example music archive'&&IntentCore.classify(video,{...fixtureSettings,mode:'off'}).visible);
     return {ok:true,key:message.key,items,semantic:true};
    }
    if(message.type==='GET_FEED')return {ok:true,key:message.key,items:[],semantic:true,exhausted:true};
    return fixtureState();
   }}};
   window.fixturePaused=false;
   window.fixtureState=()=>({ok:true,settings:structuredClone(fixtureSettings),tabPaused:fixturePaused,blocked:false,usedMs:0,remainingMs:3600000,timerRunning:false,tabCounting:false,timerExempt:true,timerDay:'2026-10-28',timerUpdatedAt:Date.now()});
   window.pauseFromExtension=paused=>{fixturePaused=paused;for(const listener of messageListeners)listener({type:'SETTINGS',settings:structuredClone(fixtureSettings),tabPaused:paused});};
  },{current,other});
  await page.addScriptTag({path:path.join(root,'src/core.js')});
  await page.evaluate(()=>window.fixtureSettings=IntentCore.sanitize({mode:'music',metadataLimit:0,limitEnabled:false}));
  for(const file of ['feed.js','feed-theme.js','recommendations.js','native-cards.js','native-renderer.js','home.js','toolbar.js'])await page.addScriptTag({path:path.join(root,'src',file)});
  await page.addStyleTag({path:path.join(root,'src/content.css')});
  await page.addScriptTag({path:path.join(root,'src/content.js')});
  const feed=page.locator('#intent-watch-feed'),toolbar=page.locator('#intent-toolbar');
  const expected=['playlist:PL_CURRENT','playlist:RD'+current,'playlist:PL_MODERN',other,'playlist:PL_ONLY','playlist:PL_FALLBACK','playlist:PL_FALLBACK_ONLY'];
  const matches=async()=>{await page.waitForFunction(expected=>{const host=document.querySelector('#intent-watch-feed');return host&&host.shadowRoot.querySelectorAll('.recommended-grid .card').length===expected.length;},expected);assert.deepEqual(await feed.locator('.recommended-grid .card').evaluateAll(cards=>cards.map(card=>card.dataset.videoId)),expected);};
  await matches();
  const checked=await page.evaluate(()=>requests.filter(message=>message.type==='FILTER_RECOMMENDATIONS').flatMap(message=>message.videos));
  assert.ok(checked.some(video=>video.id==='playlist:PL_CURRENT'&&video.videoId===current),'a playlist beginning with the current video remains a separate candidate');
  assert.ok(checked.some(video=>video.id===other)&&checked.some(video=>video.id==='playlist:PL_MODERN'&&video.videoId===other),'the playlist and its first individual video are classified independently');
  assert.equal(checked.some(video=>video.id===current),false);assert.ok(checked.some(video=>video.id==='playlist:PL_COMEDY'));
  assert.equal(await feed.locator('#unrelated').count(),0);assert.equal(await page.locator('#native-owner #unrelated').isVisible(),false,'nonmatching playlists remain in the inaccessible native source');
  assert.equal(await feed.locator('#current-list').evaluate(node=>node===originals.get('current-list')),true);
  assert.equal(await feed.locator('#modern-list').evaluate(node=>node===originals.get('modern-list')),true);
  await feed.locator('#current-list').getByRole('button',{name:'Native list menu'}).click();
  assert.equal(await page.evaluate(()=>controllers.get(originals.get('current-list')).clicks),1,'the native playlist controller/listener survives moving into the filtered UI');
  const href=async id=>feed.locator(`.card[data-video-id="${id}"] .title`).getAttribute('href');
  assert.equal(await href('playlist:PL_FALLBACK'),'https://www.youtube.com/watch?v='+other+'&list=PL_FALLBACK');
  assert.equal(await href('playlist:PL_FALLBACK_ONLY'),'https://www.youtube.com/playlist?list=PL_FALLBACK_ONLY');
  assert.equal(await feed.locator('.card[data-video-id="playlist:PL_FALLBACK"] [data-intent-created-card]').count(),0,'unsupported playlist renderers use a normal safe-link fallback, never a forged native endpoint');
  assert.equal(checked.some(video=>'navigationEndpoint'in video||'privateTracking'in video||'url'in video),false,'arbitrary page endpoint/tracking fields never enter the backend contract');
  const assertRestored=async()=>{
   await feed.waitFor({state:'detached'});
   assert.deepEqual(await page.evaluate(()=>readRestoration()),await page.evaluate(()=>originalSnapshot),'Off/Pause restore exact native node identity, controller, parent/order, style values/priorities and owner accessibility');
   assert.equal(await page.evaluate(()=>document.querySelector('#playing-video')===nativePlayer),true);
   assert.equal(await page.locator('[data-intent-native-card],[data-intent-native-staging]').count(),0);
  };
  await toolbar.getByRole('combobox',{name:'Intent mode',exact:true}).click();await toolbar.locator('[role=option][data-mode=off]').click();await assertRestored();
  await toolbar.getByRole('combobox',{name:'Intent mode',exact:true}).click();await toolbar.locator('[role=option][data-mode=music]').click();await matches();
  await page.evaluate(()=>pauseFromExtension(true));await assertRestored();
  await page.locator('#current-list').getByRole('button',{name:'Native list menu'}).click();assert.equal(await page.evaluate(()=>controllers.get(originals.get('current-list')).clicks),2);
  await page.evaluate(()=>pauseFromExtension(false));await matches();
  assert.equal(await feed.locator('#current-list').evaluate(node=>node===originals.get('current-list')),true,'resuming reuses the same playlist node again');
  assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
  const output=path.join(root,'test-results/playlist-recommendations.json');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify({passed:true,classifier:'explicit deterministic channel-based double; no model accuracy claim',matchingIDs:expected,offAndPauseRestoreNativeIdentity:true,fallbackURLsCanonical:true},null,2)+'\n');
  console.log('PASS Watch playlist/mix filtering, current-first-video independence, native controller identity, exact Off/Pause restoration and canonical safe-link fallbacks (explicit classifier double)');
 }finally{await context.close();await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
