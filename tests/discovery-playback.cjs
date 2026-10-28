// Real playback regression. Only YouTube's server responses/components are
// synthetic; HTMLMediaElement.play/pause, decoding, seeking and navigation run natively.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..');
const DISCOVERY='D0000000001',ORIGINAL='O0000000001',CURRENT='P0000000000';
const media=Buffer.alloc(160044);media.write('RIFF');media.writeUInt32LE(media.length-8,4);media.write('WAVE',8);media.write('fmt ',12);media.writeUInt32LE(16,16);media.writeUInt16LE(1,20);media.writeUInt16LE(1,22);media.writeUInt32LE(8000,24);media.writeUInt32LE(16000,28);media.writeUInt16LE(2,32);media.writeUInt16LE(16,34);media.write('data',36);media.writeUInt32LE(media.length-44,40);
const bootstrap=({surface,variant,id})=>`<!doctype html><html><meta charset="utf-8"><style>
*{box-sizing:border-box}body{margin:0;font-family:Arial}ytd-browse,ytd-rich-grid-renderer,ytd-watch-flexy,ytd-rich-item-renderer,ytd-compact-video-renderer,yt-lockup-view-model,ytd-rich-grid-media{display:block}#masthead{height:56px;padding:16px;background:#eee}#primary{width:calc(100% - 48px);margin:24px auto}#native-contents{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}ytd-watch-flexy{display:grid;grid-template-columns:minmax(0,1fr) 430px;gap:24px;padding:24px}#fixture-player{display:block;width:640px;max-width:100%;height:320px;background:#123}.fixture-cover{display:block;aspect-ratio:16/9;background:#456;position:relative;overflow:hidden}.fixture-cover img{width:100%;height:100%;object-fit:cover}.fixture-hover{position:absolute;inset:0;width:100%;height:100%;background:#123}h3{margin:8px 0}a{color:#111}ytd-compact-video-renderer .fixture-content{display:grid;grid-template-columns:168px 1fr;gap:8px}
</style><header id="masthead">Synthetic YouTube server · real Chromium media playback</header>${surface==='home'?'<ytd-browse page-subtype="home"><main id="primary"><ytd-rich-grid-renderer><div id="native-contents"></div></ytd-rich-grid-renderer></main></ytd-browse>':'<ytd-watch-flexy video-id="'+id+'"><main id="watch-player"></main><aside id="secondary"><div id="related"><div id="native-contents"></div></div></aside></ytd-watch-flexy>'}<script>
window.documentToken=crypto.randomUUID();window.originalHandlerRuns=0;window.incompleteEndpointRuns=0;window.previewStarts=0;window.previewEnabled=false;
window.mountPlayer=(id)=>{const player=document.createElement('video');player.id='fixture-player';player.dataset.videoId=id;player.muted=true;player.autoplay=true;player.loop=true;player.src='/fixture-media.wav?video='+id;player.controls=true;const target=document.querySelector('#watch-player')||document.body;const previous=document.querySelector('#fixture-player');if(previous)previous.replaceWith(player);else target.prepend(player);player.play().catch(()=>{});return player;};
${surface==='watch'?'mountPlayer('+JSON.stringify(id)+');':''}
class FixtureCard extends HTMLElement{
 constructor(){super();this.addEventListener('click',event=>{const anchor=event.target.closest('a[href]');if(!anchor||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||anchor.target==='_blank')return;const endpoint=this.fixtureEndpoint;if(endpoint?.urlEndpoint)return;if(!endpoint?.watchEndpoint)return;event.preventDefault();const id=endpoint.watchEndpoint.videoId;if(endpoint.watchEndpoint.fixturePlaybackContext){window.originalHandlerRuns++;history.pushState({},'','/watch?v='+id);mountPlayer(id);}else{window.incompleteEndpointRuns++;history.pushState({},'','/watch?v='+id);/* Deliberately cannot initialize a player from incomplete SPA data. */}});this.addEventListener('mouseenter',()=>{if(!window.previewEnabled||!this.hasAttribute('data-intent-created-card')||document.querySelector('ytd-video-preview'))return;const overlay=document.createElement('ytd-video-preview'),rect=this.querySelector('.fixture-cover').getBoundingClientRect();overlay.style.cssText='position:fixed;z-index:9999;left:'+rect.left+'px;top:'+rect.top+'px;width:'+rect.width+'px;height:'+rect.height+'px';const link=document.createElement('a');link.id='media-container-link';link.href='/watch?v='+this.fixtureId;link.style.cssText='display:block;width:100%;height:100%';const preview=document.createElement('video');preview.className='fixture-hover';preview.muted=true;preview.autoplay=true;preview.loop=true;preview.src='/fixture-media.wav?preview='+this.fixtureId;link.append(preview);overlay.append(link);overlay.addEventListener('click',event=>{if(event.defaultPrevented||event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();incompleteEndpointRuns++;history.pushState({},'',link.href);});document.body.append(overlay);window.previewStarts++;preview.play().catch(()=>{});});}
 set data(value){this.fixtureData=value;const content=value.content||value,modern=!!content.lockupViewModel,entry=content.videoRenderer||content;const model=content.lockupViewModel;const id=model?.contentId||entry.videoId;const title=model?.metadata?.lockupMetadataViewModel?.title?.content||entry.title?.simpleText||'Original useful lesson';this.fixtureId=id;this.fixtureEndpoint=model?.rendererContext?.commandContext?.onTap?.innertubeCommand||entry.navigationEndpoint;this.dataset.fixtureVariant=modern?'modern':'legacy';const wrapper=document.createElement(modern?'yt-lockup-view-model':this.localName==='ytd-rich-item-renderer'?'ytd-rich-grid-media':'div');wrapper.className='fixture-content';wrapper.innerHTML='<a id="thumbnail" class="fixture-cover" href="/watch?v='+id+'"><img src="https://i.ytimg.com/vi/'+id+'/hqdefault.jpg" alt=""></a><div><h3><a id="video-title" href="/watch?v='+id+'"></a></h3><div id="channel-name">Example Studio</div><div id="description-text">A useful programming workshop.</div><div id="metadata-line"><span>1K views</span><span>1 day ago</span></div></div>';wrapper.querySelector('#video-title').textContent=title;this.replaceChildren(wrapper);}
 get data(){return this.fixtureData;}
}
for(const tag of ['ytd-rich-item-renderer','ytd-compact-video-renderer'])customElements.define(tag,class extends FixtureCard{});
for(const tag of ['yt-lockup-view-model','ytd-rich-grid-media','ytd-video-renderer'])customElements.define(tag,class extends HTMLElement{});
const original=document.createElement(${JSON.stringify(surface==='watch'&&variant==='modern'?'yt-lockup-view-model':surface==='watch'?'ytd-compact-video-renderer':'ytd-rich-item-renderer')});
const endpoint={commandMetadata:{webCommandMetadata:{url:'/watch?v=${ORIGINAL}'}},watchEndpoint:{videoId:${JSON.stringify(ORIGINAL)},fixturePlaybackContext:true}};
const originalData={videoId:${JSON.stringify(ORIGINAL)},title:{simpleText:'Original native recommendation'},navigationEndpoint:endpoint};
${surface==='watch'&&variant==='modern'?`original.innerHTML='<a id="thumbnail" class="fixture-cover" href="/watch?v=${ORIGINAL}"><img src="https://i.ytimg.com/vi/${ORIGINAL}/hqdefault.jpg"></a><h3><a id="video-title" href="/watch?v=${ORIGINAL}">Original native recommendation</a></h3><div id="channel-name">Example Studio</div>';original.addEventListener('click',event=>{const a=event.target.closest('a');if(!a||event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();originalHandlerRuns++;history.pushState({},'','/watch?v=${ORIGINAL}');mountPlayer(${JSON.stringify(ORIGINAL)});});`:`original.data=${surface==='home'&&variant==='modern'?`{content:{lockupViewModel:{contentId:${JSON.stringify(ORIGINAL)},metadata:{lockupMetadataViewModel:{title:{content:'Original native recommendation'}}},rendererContext:{commandContext:{onTap:{innertubeCommand:endpoint}}}}}}`:surface==='home'?'{content:{videoRenderer:originalData}}':'originalData'};`}
original.id='original-recommendation';document.querySelector('#native-contents').append(original);window.originalRecommendation=original;
</script></html>`;
(async()=>{
 const browser=await chromium.launch({channel:'chromium',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 const context=await browser.newContext({viewport:{width:1600,height:1000},serviceWorkers:'block'});context.setDefaultTimeout(10000);
 const errors=[],navigations=[];context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
 await context.route('https://www.youtube.com/**',route=>{const url=new URL(route.request().url());if(url.pathname==='/fixture-media.wav')return route.fulfill({contentType:'audio/wav',headers:{'Accept-Ranges':'bytes'},body:media});if(!route.request().isNavigationRequest())return route.abort();navigations.push(url.href);return route.fulfill({contentType:'text/html',body:bootstrap({surface:url.pathname==='/watch'?'watch':'home',variant:url.searchParams.get('variant')||'legacy',id:url.searchParams.get('v')||CURRENT})});});
 await context.route('https://i.ytimg.com/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#456"/></svg>'}));
 const playing=async(page,id)=>{await page.waitForFunction(id=>{const video=document.querySelector('#fixture-player');return video instanceof HTMLMediaElement&&video.dataset.videoId===id&&!video.paused&&video.readyState>=2;},id);const start=await page.locator('#fixture-player').evaluate(video=>video.currentTime);await page.waitForFunction(start=>document.querySelector('#fixture-player').currentTime>=start+.15,start);assert.equal(await page.evaluate(()=>/\[native code\]/.test(HTMLMediaElement.prototype.play.toString())&&/\[native code\]/.test(HTMLMediaElement.prototype.pause.toString())),true,'media methods remain native');};
 const mount=async(surface,variant)=>{
  const page=await context.newPage();await page.goto(`https://www.youtube.com/${surface==='watch'?'watch?v='+CURRENT+'&':'?'}variant=${variant}`);
  for(const file of ['core.js','feed.js','feed-theme.js','recommendations.js','native-cards.js','native-renderer.js','home.js'])await page.addScriptTag({path:path.join(root,'src',file)});
  await page.addStyleTag({path:path.join(root,'src/content.css')});
  await page.evaluate(({surface,id})=>{const settings=IntentCore.sanitize({metadataLimit:0});window.controller=new IntentHome({sendMessage:async message=>message.type==='FILTER_RECOMMENDATIONS'?{ok:true,key:message.key,items:message.videos,semantic:true}:{ok:true,key:message.key,items:[{id,title:'A generated discovery lesson',channel:'Example Studio',description:'A useful programming workshop.',thumbnail:'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg',metadata:'1K views · 1 day ago',duration:'0:10',shorts:false}],semantic:true,exhausted:true}},surface);controller.sync(settings,true);},{surface,id:DISCOVERY});
  const host=page.locator(`#intent-${surface}-feed`);await host.locator('[data-intent-created-card]').waitFor();await host.locator('#original-recommendation').waitFor();
  assert.equal(await host.locator('[data-intent-created-card]').getAttribute('data-fixture-variant'),variant);
  if(surface==='watch')await playing(page,CURRENT);
  return{page,host,generated:host.locator('[data-intent-created-card]')};
 };
 try{
  for(const surface of ['home','watch'])for(const variant of ['legacy','modern']){
   for(const target of ['title','thumbnail','hover-thumbnail','keyboard']){
    const {page,generated}=await mount(surface,variant);const token=await page.evaluate(()=>documentToken);
    if(target==='hover-thumbnail'){await page.evaluate(()=>previewEnabled=true);const box=await generated.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.locator('ytd-video-preview .fixture-hover').waitFor();await page.waitForFunction(()=>document.querySelector('ytd-video-preview .fixture-hover')?.currentTime>.1);assert.equal(await page.locator('ytd-video-preview').evaluate(node=>!!node.closest('#intent-home-feed,#intent-watch-feed')),false);await page.locator('ytd-video-preview #media-container-link').click();}
    else if(target==='keyboard'){await generated.locator('#video-title').focus();await page.keyboard.press('Enter');}
    else await generated.locator(target==='title'?'#video-title':'#thumbnail').click();
    await page.waitForURL('https://www.youtube.com/watch?v='+DISCOVERY);await playing(page,DISCOVERY);
    assert.notEqual(await page.evaluate(()=>documentToken),token,'generated discovery navigation must initialize a fresh watch document, rather than retaining the previous player');
    assert.equal(await page.evaluate(()=>incompleteEndpointRuns),0);await page.close();
   }
   const original=await mount(surface,variant),token=await original.page.evaluate(()=>documentToken);
   await original.host.locator('#original-recommendation #video-title').click();await playing(original.page,ORIGINAL);
   assert.equal(await original.page.evaluate(()=>documentToken),token,'the existing native recommendation keeps its original SPA controller');
   assert.equal(await original.page.evaluate(()=>originalHandlerRuns),1);await original.page.close();
   for(const kind of ['target-blank','modifier','middle']){
    const {page,generated}=await mount(surface,variant),token=await page.evaluate(()=>documentToken),link=generated.locator('#video-title');
    if(kind==='target-blank')await link.evaluate(anchor=>anchor.target='_blank');
    const opened=context.waitForEvent('page');await link.click(kind==='modifier'?{modifiers:[process.platform==='darwin'?'Meta':'Control']}:kind==='middle'?{button:'middle'}:{});
    const tab=await opened;await tab.waitForURL('https://www.youtube.com/watch?v='+DISCOVERY,{waitUntil:'commit'});
    // Headless Chromium can defer background Meta/middle-click documents. The
    // target=_blank path proves decoding; these two retain native tab semantics.
    if(kind==='target-blank'){await tab.bringToFront();await playing(tab,DISCOVERY);}
    assert.equal(await page.evaluate(()=>documentToken),token,'new-tab actions leave the source player/document in place');
    assert.equal(await page.evaluate(()=>incompleteEndpointRuns),0);await tab.close();await page.close();
   }
   console.log(`PASS ${surface}/${variant}: generated title, thumbnail, external hover-preview, Enter and target=_blank advance real media; modifier/middle tab semantics and original SPA playback remain intact`);
  }
  assert.deepEqual(errors,[]);assert.ok(navigations.filter(url=>url.includes('v='+DISCOVERY)).length>=20);
  const output=path.join(root,'test-results/discovery-playback.json');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify({passed:true,combinations:4,generatedPlaybackChecks:20,nativeBackgroundTabChecks:8,originalPlaybackChecks:4,media:'PCM WAV decoded by native HTMLVideoElement',uncaughtErrors:errors},null,2)+'\n');
 }finally{await context.close();await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
