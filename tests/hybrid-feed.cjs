const {chromium}=require('playwright'),path=require('path'),fs=require('fs'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),shots=path.resolve(process.env.INTENT_SCREENSHOTS||'test-results');fs.mkdirSync(shots,{recursive:true});
(async()=>{const browser=await chromium.launch({channel:'chromium',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://www.youtube.com/**',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><html dark lang="en-GB"><meta charset="utf-8"><style>html{--yt-spec-base-background:#0f0f0f;--yt-spec-text-primary:#f1f1f1;--yt-spec-text-secondary:#aaa}body{margin:0;background:#0f0f0f;color:#f1f1f1;font:14px Arial}ytd-masthead{display:block;height:56px;padding:0 32px;line-height:56px;border-bottom:1px solid #ffffff20}ytd-browse{display:block;padding:24px 32px}#primary{display:block}ytd-rich-grid-renderer{display:block;--ytd-rich-grid-items-per-row:3}ytd-watch-flexy{display:block;padding:24px}#related{width:420px}ytd-thumbnail{display:block;width:196px}ytd-compact-video-renderer{display:block}</style><ytd-masthead>YouTube · Intent regression preview</ytd-masthead><ytd-browse page-subtype="home"><div id="primary"><ytd-rich-grid-renderer id="native"></ytd-rich-grid-renderer></div></ytd-browse></html>`}));
 await page.route('https://i.ytimg.com/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#203a34"/><path d="M90 120h300M90 180h200M90 240h350" stroke="#a4c9b4" stroke-width="14" stroke-linecap="round"/></svg>'}));
 await page.goto('https://www.youtube.com/');for(const file of ['core','feed','feed-theme','recommendations','home'])await page.addScriptTag({path:path.join(root,'src',file+'.js')});await page.addStyleTag({path:path.join(root,'src/content.css')});
 await page.evaluate(()=>{
  window.addNative=(id,title,shorts=false,target=document.querySelector('#native'))=>{const card=document.createElement('ytd-rich-item-renderer');card.innerHTML=`<a id="video-title" href="${shorts?'/shorts/'+id:'/watch?v='+id}">${title}</a><div id="channel-name"><a>Helpful creator</a></div><div id="metadata-line"><span>3.9M views</span><span>2 years ago</span></div><div id="description-text">A tutorial for building reliable software.</div>`;target.append(card);return card;};
  window.video=(id,title)=>({id,title,channel:'Helpful creator',metadata:'3.9M views · 2 years ago',thumbnail:`https://i.ytimg.com/vi/${id}/hqdefault.jpg`});
  window.settings=IntentCore.sanitize({mode:'work',metadataLimit:0});window.calls=[];window.releaseNative=null;window.delayNative=false;
  window.runtime={getURL:p=>'https://extension.test/'+p,sendMessage:async message=>{calls.push(message);if(message.type==='FILTER_RECOMMENDATIONS'){if(delayNative)await new Promise(resolve=>releaseNative=resolve);return{ok:true,key:message.key,semantic:true,items:message.videos.filter(v=>v.title.includes('Build')&&(!v.shorts||!settings.hideShorts))};}return{ok:true,key:message.key,semantic:true,items:[video('N0000000001','Build a reliable app'),video('D0000000001','Build a tiny compiler'),video('D0000000002','Build a keyboard')],hasMore:false,nextCursor:1};}};
  addNative('N0000000001','Build a reliable app');addNative('N0000000002','Unrelated celebrity interview');addNative('N0000000003','Build a local database');window.home=new IntentHome(runtime);home.sync(settings,true);
 });
 const feed=page.locator('#intent-home-feed'),recommended=feed.locator('[aria-labelledby="home-recommended-heading"]'),discover=feed.locator('[aria-labelledby="home-discovery-heading"]');
 await page.waitForFunction(()=>home.recommendedItems.length===2&&!home.busy);
 assert.deepEqual(await recommended.locator('.title').allTextContents(),['Build a reliable app','Build a local database']);
 assert.deepEqual(await discover.locator('.title').allTextContents(),['Build a tiny compiler','Build a keyboard']);
 assert.equal(await feed.locator('[data-video-id="N0000000001"]').count(),1,'accepted native recommendation wins over the search duplicate');
 assert.ok(await recommended.evaluate((n)=>n.getBoundingClientRect().top<n.nextElementSibling.getBoundingClientRect().top));assert.equal(await recommended.locator('.source-title svg').count(),1);
 assert.equal(await page.locator('#native').isVisible(),false);assert.equal(await recommended.locator('.meta').first().innerText(),'3.9M views · 2 years ago');
 assert.ok((await page.evaluate(()=>calls)).filter(m=>m.type==='FILTER_RECOMMENDATIONS').every(m=>m.videos.length<=48));
 await page.screenshot({path:path.join(shots,'intent-hybrid-sections.png'),fullPage:true});
 // Late native matches move into the correct source section and remain deduplicated.
 await page.evaluate(()=>{addNative('D0000000001','Build a tiny compiler');return home.syncRecommendations();});
 assert.equal(await discover.locator('[data-video-id="D0000000001"]').count(),0);assert.equal(await recommended.locator('[data-video-id="D0000000001"]').count(),1);
 await recommended.locator('[data-video-id="N0000000001"] .title').focus();
 await page.evaluate(()=>{addNative('N0000000004','Build an event loop');return home.syncRecommendations();});
 assert.equal(await page.evaluate(()=>home.host.shadowRoot.activeElement?.closest('.card')?.dataset.videoId),'N0000000001','incremental results preserve keyboard focus');
 const callsBefore=await page.evaluate(()=>calls.length);for(let i=0;i<10;i++)await page.evaluate(()=>home.sync(settings,true));
 assert.equal(await page.evaluate(()=>calls.length),callsBefore,'routine page scans do not repeat classification');
 // The native continuation button is used without public discovery requests.
 await page.evaluate(()=>{const continuation=document.createElement('ytd-continuation-item-renderer');continuation.innerHTML='<button>Native load more</button>';continuation.querySelector('button').onclick=()=>{addNative('N0000000005','Build resilient services');continuation.remove();};document.querySelector('#native').append(continuation);});
 const searches=await page.evaluate(()=>calls.filter(m=>m.type==='GET_FEED').length);await feed.getByRole('button',{name:'Find more recommendations',exact:true}).click();
 await recommended.locator('[data-video-id="N0000000005"]').waitFor();assert.equal(await page.evaluate(()=>calls.filter(m=>m.type==='GET_FEED').length),searches);
 await feed.getByRole('button',{name:'Find more recommendations',exact:true}).click();await page.waitForFunction(()=>!home.nativeMoreBusy);assert.match(await feed.locator('.recommended-feedback').innerText(),/no further recommendation batch/i);
 // No accepted recommendations means no section header, separator or blank space.
 await page.evaluate(()=>{document.querySelector('#native').replaceChildren();addNative('U0000000001','Unrelated interview');return home.refreshFeed();});await page.waitForFunction(()=>!home.nativeJob&&!home.busy);
 assert.equal(await recommended.isVisible(),false);assert.equal(await discover.getByRole('button',{name:'Find more recommendations',exact:true}).isVisible(),true);
 assert.equal(await discover.evaluate(n=>getComputedStyle(n).marginTop),'0px');assert.equal(await discover.evaluate(n=>getComputedStyle(n).paddingTop),'0px');
 // A rolling candidate window reaches relevant videos beyond the former 240 lifetime cap.
 await page.evaluate(()=>{document.querySelector('#native').replaceChildren();for(let i=0;i<400;i++)addNative('P'+String(i).padStart(10,'0'),i>=310&&i<320?'Build a travel planning app '+i:'Unrelated entertainment '+i);return home.refreshFeed();});
 await page.waitForFunction(()=>home.nativeTotalChecked===96&&!home.nativeJob&&!home.busy);
 await feed.getByRole('button',{name:'Find more recommendations',exact:true}).click();await page.waitForFunction(()=>!home.nativeMoreBusy);
 assert.equal(await recommended.locator('.card').count(),10,'one click reaches matching videos beyond the first 300 candidates');
 assert.ok(await page.evaluate(()=>home.nativeTotalChecked>310&&home.nativePool.size<=240&&home.nativeChecked.size<=2048));
 assert.match(await feed.locator('.recommended-feedback').innerText(),/288 more videos checked · 10 new matches/);
 assert.ok(await feed.locator('.recommended-feedback').isVisible(),'feedback moves with the button after refresh and after the first accepted recommendation');
 // Stale responses cannot bring an old intent back after Off/Pause.
 await page.evaluate(()=>{delayNative=true;home.nativeLimit=home.nativeTotalChecked+96;addNative('N0000000006','Build a stale result');home.syncRecommendations();home.sync(settings,false);releaseNative();});await page.waitForTimeout(30);assert.equal(await feed.count(),0);assert.equal(await page.locator('#native').isVisible(),true);
 await page.evaluate(()=>{delayNative=false;settings=IntentCore.sanitize({...settings,hideShorts:false});document.querySelector('#native').replaceChildren();addNative('S0000000001','Build in sixty seconds',true);home.sync(settings,true);});await page.waitForFunction(()=>home.recommendedItems.length===1);
 assert.equal(await recommended.locator('.recommended-shorts').isVisible(),true);assert.match(await recommended.locator('.title').getAttribute('href'),/shorts/);
 await page.evaluate(()=>{settings=IntentCore.sanitize({...settings,hideShorts:true});home.sync(settings,true);});await page.waitForFunction(()=>!home.nativeJob&&!home.busy);assert.equal(await recommended.isVisible(),false);
 // Watch native list uses the same section order, excludes the current video and preserves playback.
 await page.evaluate(()=>{home.destroy();document.querySelector('ytd-browse').remove();history.replaceState({},'','/watch?v=W0000000001');const watch=document.createElement('ytd-watch-flexy');watch.setAttribute('video-id','W0000000001');watch.innerHTML='<div id="player"><video></video></div><div id="secondary"><div id="related"><ytd-watch-next-secondary-results-renderer id="native-related"></ytd-watch-next-secondary-results-renderer></div></div>';document.body.append(watch);window.player=watch.querySelector('video');player.currentTime=37;window.pauses=0;player.pause=()=>pauses++;addNative('W0000000001','Build the current video',false,document.querySelector('#native-related'));addNative('W0000000002','Build a watch recommendation',false,document.querySelector('#native-related'));window.related=new IntentHome(runtime,'watch');related.sync(settings,true);});
 const watchFeed=page.locator('#intent-watch-feed');await watchFeed.locator('[data-video-id="W0000000002"]').waitFor();assert.equal(await watchFeed.locator('[data-video-id="W0000000001"]').count(),0);assert.equal(await page.evaluate(()=>player===document.querySelector('video')&&player.currentTime===37&&pauses===0),true);
 await page.evaluate(()=>related.sync(settings,false));assert.equal(await page.locator('#native-related').isVisible(),true);assert.equal(await page.evaluate(()=>pauses),0);
 // Context errors request disposal, never persist the raw runtime error in the UI.
 await page.evaluate(()=>{window.lost=0;document.addEventListener('intent-context-lost',()=>lost++);runtime.sendMessage=async()=>{throw new Error('Extension context invalidated.');};related.sync(settings,true);});await page.waitForFunction(()=>lost>0);assert.equal(await watchFeed.getByText('Extension context invalidated.',{exact:true}).count(),0);
 assert.deepEqual(errors,[]);console.log('PASS hybrid feed: native-first sources, hidden empty section, late dedup/focus, bounded stable scans, genuine native continuation, exhaustion, stale/Pause, Shorts, watch exclusion/playback and context-loss handoff.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
