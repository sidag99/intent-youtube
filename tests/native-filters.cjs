const {chromium}=require('playwright'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{const browser=await chromium.launch({channel:'chromium',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://www.youtube.com/**',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><html lang="en"><style>body{font:14px Arial}ytd-watch-flexy{display:block}#related{width:435px}ytd-compact-video-renderer{display:block;width:435px}ytd-thumbnail{display:block;width:168px;height:94px}yt-lockup-view-model{display:block;width:435px}.ytLockupViewModelContentImage{width:435px;height:245px}#player{height:80px}</style><ytd-watch-flexy video-id="W0000000000"><div id="player"><video></video></div><div id="secondary"><div id="related"><ytd-watch-next-secondary-results-renderer><div id="items"><ytd-item-section-renderer><div id="header"><yt-related-chip-cloud-renderer style="color:purple"><div id="content"><yt-chip-cloud-renderer><yt-chip-cloud-chip-renderer selected>All</yt-chip-cloud-chip-renderer> <yt-chip-cloud-chip-renderer>Learning</yt-chip-cloud-chip-renderer> <yt-chip-cloud-chip-renderer>Related</yt-chip-cloud-chip-renderer></yt-chip-cloud-renderer></div></yt-related-chip-cloud-renderer></div><div id="native-list"></div></ytd-item-section-renderer></div></ytd-watch-next-secondary-results-renderer></div></div></ytd-watch-flexy></html>`}));
 await page.route('https://i.ytimg.com/**',r=>r.fulfill({status:204}));
 await page.goto('https://www.youtube.com/watch?v=W0000000000');
 for(const file of ['core','feed','feed-theme','recommendations','native-cards','native-filters','home'])await page.addScriptTag({path:path.join(root,'src',file+'.js')});await page.addStyleTag({path:path.join(root,'src/content.css')});
 await page.evaluate(()=>{
  window.settings=IntentCore.sanitize({mode:'study',metadataLimit:0});window.calls=[];window.clicks=[];window.pauses=0;window.player=document.querySelector('video');player.currentTime=37;player.pause=()=>pauses++;
  window.bar=document.querySelector('yt-related-chip-cloud-renderer');window.barParent=bar.parentNode;window.barStyle=bar.getAttribute('style');
  // The listener deliberately lives on the original ancestor, as native Polymer delegation can.
  bar.closest('ytd-item-section-renderer').addEventListener('click',e=>{const chip=e.target.closest('yt-chip-cloud-chip-renderer');if(!chip)return;clicks.push(chip.textContent);bar.querySelectorAll('yt-chip-cloud-chip-renderer').forEach(n=>n.toggleAttribute('selected',n===chip));});
  window.addNative=(id,title)=>{const card=document.createElement('ytd-compact-video-renderer');card.innerHTML=`<a id="video-title" href="/watch?v=${id}">${title}</a><ytd-thumbnail></ytd-thumbnail><div id="channel-name">Teacher</div><div id="metadata-line">1M views</div>`;document.querySelector('#native-list').append(card);return card;};
  window.video=(id,title)=>({id,title,channel:'Teacher',thumbnail:`https://i.ytimg.com/vi/${id}/hqdefault.jpg`});
  window.defer=false;window.releases=[];window.runtime={getURL:p=>'https://extension.test/'+p,sendMessage:async m=>{calls.push(m);if(m.type==='FILTER_RECOMMENDATIONS'){if(defer)await new Promise(r=>releases.push(r));return{ok:true,key:m.key,semantic:true,items:m.videos.filter(v=>v.title.includes('Lesson'))};}return{ok:true,key:m.key,semantic:true,items:[video('D0000000001','Lesson public discovery')],hasMore:false,nextCursor:1};}};
  addNative('N0000000001','Lesson initial');addNative('U0000000001','Unrelated initial');window.home=new IntentHome(runtime,'watch');home.sync(settings,true);
 });
 const feed=page.locator('#intent-watch-feed'),filters=feed.locator('.native-filter-chip'),recommended=feed.locator('[aria-labelledby="home-recommended-heading"]');
 await page.waitForFunction(()=>home.recommendedItems.length===1&&!home.busy);
 assert.deepEqual(await filters.allTextContents(),['All','Learning','Related']);assert.equal(await filters.first().getAttribute('aria-pressed'),'true');
 assert.equal(await page.evaluate(()=>bar.parentNode===barParent&&bar.getAttribute('style')===barStyle&&clicks.length===0),true,'original tree/styles/controllers remain intact, with no automatic filter choice');
 const searches=await page.evaluate(()=>calls.filter(m=>m.type==='GET_FEED').length);
 await filters.nth(1).click();await page.waitForFunction(()=>home.nativeFilters.waiting);
 assert.equal(await recommended.isVisible(),false);assert.deepEqual(await page.evaluate(()=>clicks),['Learning'],'user click reaches original ancestor listener');
 await page.evaluate(()=>home.sync(settings,true));assert.equal(await recommended.isVisible(),false,'unchanged previous-filter cards stay quarantined');
 await page.evaluate(()=>{const old=document.querySelector('#native-list ytd-compact-video-renderer');old.append(document.createElement('img'));old.querySelector('#metadata-line').textContent='2M views';});await page.waitForTimeout(30);
 assert.equal(await page.evaluate(()=>home.nativeFilters.waiting),true,'lazy old thumbnails/view counts are not a filter response');
 await page.evaluate(()=>{document.querySelector('#native-list').replaceChildren();addNative('N0000000002','Lesson learning filter');addNative('U0000000002','Unrelated learning filter');});
 await page.waitForFunction(()=>home.recommendedItems.some(v=>v.id==='N0000000002'));
 assert.deepEqual(await page.evaluate(()=>home.recommendedItems.map(v=>v.id)),['N0000000002']);assert.equal(await feed.locator('[data-video-id="D0000000001"]').count(),1);assert.equal(await page.evaluate(()=>calls.filter(m=>m.type==='GET_FEED').length),searches);
 // A previous filter's delayed classification cannot replace the newest selection.
 await page.evaluate(()=>{defer=true;addNative('N0000000003','Lesson delayed old filter');home.syncRecommendations();});await page.waitForFunction(()=>releases.length===1);
 await filters.nth(2).click();await page.evaluate(()=>{defer=false;document.querySelector('#native-list').replaceChildren();addNative('N0000000004','Lesson related filter');});await page.waitForFunction(()=>home.recommendedItems.some(v=>v.id==='N0000000004'));
 await page.evaluate(()=>releases.shift()());await page.waitForTimeout(30);assert.deepEqual(await page.evaluate(()=>home.recommendedItems.map(v=>v.id)),['N0000000004']);
 // An empty match set keeps native refinements available, with the selected scope intact.
 await filters.nth(1).click();await page.evaluate(()=>{document.querySelector('#native-list').replaceChildren();addNative('U0000000003','Unrelated new selection');});await page.waitForFunction(()=>!home.nativeFilters.waiting&&!home.nativeJob);
 assert.equal(await recommended.isVisible(),false);assert.equal(await filters.nth(1).isVisible(),true);assert.equal(await filters.nth(1).getAttribute('aria-pressed'),'true');
 // Reusing a native renderer with a changed video href releases that renderer only.
 await filters.nth(2).click();await page.evaluate(()=>{const n=document.querySelector('#native-list ytd-compact-video-renderer');n.querySelector('a').href='/watch?v=N0000000005';n.querySelector('a').textContent='Lesson reused native renderer';});await page.waitForFunction(()=>home.recommendedItems.some(v=>v.id==='N0000000005'));
 // Measured modern cards can be full-width and use YouTube's current camel-case image class.
 const modern=await page.evaluate(()=>{const n=document.createElement('yt-lockup-view-model');n.innerHTML='<div class="ytLockupViewModelContentImage"></div>';document.querySelector('#native-list').append(n);home.matchWatchThumbnail(home.primary);return{width:home.host.style.getPropertyValue('--intent-watch-thumbnail-width'),renderer:home.host.dataset.nativeWatchRenderer,layout:home.host.dataset.nativeWatchLayout};});
 assert.deepEqual(modern,{width:'168px',renderer:'compact',layout:'compact'}); // First native renderer determines the actual mixed-list layout.
 await page.evaluate(()=>{document.querySelector('#native-list ytd-compact-video-renderer').remove();home.matchWatchThumbnail(home.primary);});
 assert.deepEqual(await page.evaluate(()=>({width:home.host.style.getPropertyValue('--intent-watch-thumbnail-width'),renderer:home.host.dataset.nativeWatchRenderer,layout:home.host.dataset.nativeWatchLayout})),{width:'435px',renderer:'modern',layout:'stacked'});
 await page.evaluate(()=>home.sync(settings,false));
 assert.equal(await feed.count(),0);assert.equal(await page.evaluate(()=>bar.parentNode===barParent&&bar.getAttribute('style')===barStyle&&player===document.querySelector('video')&&player.currentTime===37&&pauses===0),true);
 assert.equal(await page.locator('yt-chip-cloud-chip-renderer[selected]').innerText(),'Related');
 await page.evaluate(()=>home.sync(settings,true));await page.waitForFunction(()=>!home.busy);assert.equal(await filters.count(),3);assert.deepEqual(await page.evaluate(()=>clicks),['Learning','Related','Learning','Related']);
 await page.evaluate(()=>{home.destroy();const old=document.querySelector('ytd-watch-flexy');old.remove();history.replaceState({},'','/watch?v=W0000000001');const next=old.cloneNode(true);next.setAttribute('video-id','W0000000001');document.body.append(next);home.sync(settings,true);});await page.waitForFunction(()=>!home.busy);
 assert.equal(await filters.count(),3);assert.equal(await page.evaluate(()=>home.nativeFilters.entry.isConnected&&home.nativeFilters.entry!==bar),true,'SPA connects only the new native bar');
 assert.deepEqual(errors,[]);console.log('PASS native filters: original delegated clicks, selected state, stale/lazy metadata quarantine, stale inference, independent discovery, empty matches, reused cards, full-width modern geometry, Off/SPA and playback preservation.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
