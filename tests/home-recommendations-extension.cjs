// Synthetic YouTube responses/native renderer contract; real MV3 messaging,
// offscreen model and classification. This is not a signed-in live-feed test.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const lecture='Lecture 1: Introduction to Power and Politics in Today’s World';
const clip='Awkward Introductions That Just Keep Getting Worse';
const originals=[{id:'N0000000001',title:lecture,channel:'YaleCourses'},{id:'N0000000002',title:clip,channel:'The Big Bang Theory'}];
const discoveries=[{id:'D0000000001',title:lecture,channel:'YaleCourses'},{id:'D0000000002',title:clip,channel:'The Big Bang Theory'}];
const html=`<!doctype html><html lang="en-GB"><meta charset="utf-8"><style>
html{--yt-spec-base-background:#fff;--yt-spec-text-primary:#0f0f0f}body{font:14px Arial;margin:0}ytd-masthead{display:flex;height:56px}#center{display:flex;flex:1}#search{flex:1}ytd-browse,ytd-rich-grid-renderer,ytd-rich-item-renderer,yt-lockup-view-model{display:block}#primary{margin:24px;width:1200px}#native-contents{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}a{color:inherit}h3{font:500 16px/22px Arial;margin:8px 0}.ytLockupViewModelContentImage{display:block;aspect-ratio:16/9;background:#ddd}.ytContentMetadataViewModelMetadataRow{font:14px/20px Arial}</style>
<ytd-masthead><div id="start">YouTube</div><div id="center"><form id="search"><input aria-label="Search"></form></div><div id="end">Account</div></ytd-masthead><ytd-browse page-subtype="home"><div id="primary"><ytd-rich-grid-renderer><div id="native-contents"></div></ytd-rich-grid-renderer></div></ytd-browse><script>
customElements.define('yt-lockup-view-model',class extends HTMLElement{});
customElements.define('ytd-rich-item-renderer',class extends HTMLElement{
 set data(value){this.receivedData=value;this.renderWrites=(this.renderWrites||0)+1;const m=value.content.lockupViewModel,id=m.contentId,n=document.createElement('yt-lockup-view-model');
 n.innerHTML='<a class="ytLockupViewModelContentImage" href="/watch?v='+id+'"></a><h3><a href="/watch?v='+id+'"></a></h3><div class="ytContentMetadataViewModelHost"></div>';
 n.querySelector('h3 a').textContent=m.metadata.lockupMetadataViewModel.title.content;
 const meta=m.metadata.lockupMetadataViewModel.metadata.contentMetadataViewModel;
 for(const row of meta.metadataRows){const r=document.createElement('div');r.className='ytContentMetadataViewModelMetadataRow';row.metadataParts.forEach((part,i)=>{if(i){const d=document.createElement('span');d.className='ytContentMetadataViewModelDelimiter';d.textContent=meta.delimiter;r.append(d);}if(part.leadingIcon){const icon=document.createElement('span');icon.className='ytContentMetadataViewModelLeadingIcon';icon.textContent='▷';r.append(icon);}const text=document.createElement('span');text.className='ytContentMetadataViewModelMetadataText';text.textContent=part.text.content;r.append(text);});n.querySelector('.ytContentMetadataViewModelHost').append(r);}
 this.replaceChildren(n);
 }
});
window.makeModel=(v,rows=2)=>{const parts=[{text:{content:v.channel}},{text:{content:'2.4m'},leadingIcon:{name:'PLAY_ARROW_OUTLINED'}},{text:{content:'7 yr ago'}}];return{content:{lockupViewModel:{contentId:v.id,contentType:'LOCKUP_CONTENT_TYPE_VIDEO',metadata:{lockupMetadataViewModel:{title:{content:v.title},metadata:{contentMetadataViewModel:{metadataRows:rows===1?[{metadataParts:parts}]:[{metadataParts:[parts[0]]},{metadataParts:parts.slice(1)}],delimiter:' · '}}}}}}};};
window.originals=${JSON.stringify(originals)};
for(const v of originals){const n=document.createElement('ytd-rich-item-renderer');n.id=v.id;n.data=makeModel(v);document.querySelector('#native-contents').append(n);}
window.originalLecture=document.getElementById('N0000000001');
</script></html>`;
(async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'intent-home-model-'));let context;
 try{
  context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:['--load-extension='+root],viewport:{width:1440,height:1000}});
  const errors=[];context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  await worker.evaluate(async()=>{await tick({type:'UPDATE_SETTINGS',patch:{mode:'study',metadataLimit:0,limitEnabled:false}},{url:chrome.runtime.getURL('settings.html')});const send=chrome.runtime.sendMessage.bind(chrome.runtime);globalThis.__homeModelCalls=0;chrome.runtime.sendMessage=(message,...args)=>{if(message.type==='AI_CLASSIFY'){__homeModelCalls++;}return send(message,...args);};});
  let searches=0,metadata=0;
  await context.route('https://www.youtube.com/**',route=>{const u=new URL(route.request().url());if(route.request().isNavigationRequest())return route.fulfill({contentType:'text/html',body:html});if(u.pathname==='/results'){searches++;return route.fulfill({contentType:'text/html',body:'<script>var ytInitialData='+JSON.stringify({contents:{sectionListRenderer:{contents:discoveries.map(v=>({videoRenderer:{videoId:v.id,title:{simpleText:v.title},ownerText:{simpleText:v.channel},shortViewCountText:{simpleText:'2.4m'},publishedTimeText:{simpleText:'7 yr ago'}}}))}}})+';</script>'});}if(u.pathname==='/watch')metadata++;return route.abort();});
  await context.route('https://i.ytimg.com/**',route=>route.fulfill({status:204}));
  const page=await context.newPage();await page.goto('https://www.youtube.com/');
  const host=page.locator('#intent-home-feed'),recommended=host.locator('[aria-label="Matching YouTube recommendations"]'),discovery=host.locator('[aria-label="Videos for your intent"]');
  await recommended.locator('[data-video-id="N0000000001"]').waitFor({timeout:90000}).catch(async error=>{throw new Error(error.message+'; '+JSON.stringify({errors,dom:await page.evaluate(()=>({body:document.body.innerText.slice(0,700),host:document.querySelector('#intent-home-feed')?.shadowRoot?.textContent.slice(-1200),native:document.querySelector('#native-contents')?.textContent,components:document.documentElement.getAttribute('data-intent-native-components')}))}));});
  await discovery.locator('[data-video-id="D0000000001"]').waitFor({timeout:90000});
  assert.equal(await recommended.locator('[data-video-id="N0000000002"]').count(),0,'the real model rejects the title-only sitcom despite its science-sounding creator');
  assert.equal(await discovery.locator('[data-video-id="D0000000002"]').count(),0,'public discovery applies the same content-evidence rule');
  assert.equal(await host.locator('#N0000000001').count(),1,'accepted recommendations use the actual original card');
  await page.waitForFunction(()=>document.querySelector('#intent-home-feed')?.getAttribute('data-intent-native-home-layout')?.includes('"rows":2'));
  await page.waitForFunction(()=>document.querySelector('#intent-home-feed [data-intent-created-card]')?.querySelectorAll('.ytContentMetadataViewModelMetadataRow').length===2);
  await page.waitForTimeout(100);
  const before={calls:await worker.evaluate(()=>__homeModelCalls),searches,metadata};
  const generatedBefore=await host.locator('[data-intent-created-card]').first().evaluate(n=>n.receivedData.content.lockupViewModel.contentId);
  await page.evaluate(()=>{originalLecture.data=makeModel(originals[0],1);});
  await page.waitForFunction(()=>document.querySelector('#intent-home-feed [data-intent-created-card]')?.querySelectorAll('.ytContentMetadataViewModelMetadataRow').length===1);
  await page.waitForTimeout(100);
  const after={calls:await worker.evaluate(()=>__homeModelCalls),searches,metadata};
  assert.deepEqual(after,before,'late native layout reconciliation does not repeat inference, searches or metadata requests');
  assert.equal(await page.evaluate(()=>originalLecture===document.querySelector('#N0000000001')&&originalLecture.renderWrites===2),true,'Intent never rewrites the original native card');
  assert.equal(await host.locator('[data-intent-created-card]').first().evaluate(n=>n.receivedData.content.lockupViewModel.contentId),generatedBefore);
  assert.equal(await recommended.locator('[data-video-id="N0000000002"]').count(),0);
  assert.equal(metadata,0);assert.deepEqual(errors,[]);
  const proof={passed:true,model:'actual packaged MiniLM WASM',classification:'title-only sitcom rejected in original recommendations and discovery; academic lesson retained',layout:'native 2→1 rows adopted without new inference or network requests',before,after,uncaughtErrors:errors};
  fs.mkdirSync(path.join(root,'test-results'),{recursive:true});fs.writeFileSync(path.join(root,'test-results/home-recommendations-installed.json'),JSON.stringify(proof,null,2));
  console.log('PASS installed Home: real-model sitcom rejection/lecture retention, original identity, late native metadata rows and no extra model/network work');
 }finally{await context?.close();fs.rmSync(profile,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});
