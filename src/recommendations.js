/* Read only recommendations already loaded by YouTube; pagination uses its own
   continuation control/observer, without copying account tokens or making APIs. */
(() => {
 const cards='ytd-rich-item-renderer,ytd-video-renderer,ytd-compact-video-renderer,ytd-grid-video-renderer,yt-lockup-view-model,ytd-reel-item-renderer,ytm-shorts-lockup-view-model,ytm-shorts-lockup-view-model-v2,yt-shorts-lockup-view-model,yt-shorts-lockup-view-model-v2';
 const plain=(root,selector)=>root.querySelector(selector)?.textContent?.trim()||'';
 function read(primary,currentVideo='',options={}){
  const videos=[],seen=new Set(),limit=Math.max(1,Math.min(5000,options.limit||240));
  for(const card of [...primary.querySelectorAll(cards)].slice(0,12000)){
   const previous=options.scanned?.get(card);
   if(previous&&previous.link.isConnected&&card.contains(previous.link)&&previous.link.getAttribute('href')===previous.href&&previous.title.isConnected&&(previous.title.getAttribute('title')||previous.title.textContent||'').trim()===previous.text)continue;
   if(card.closest('#intent-home-feed,#intent-watch-feed,[hidden],ytd-ad-slot-renderer,ytd-promoted-video-renderer,ytd-promoted-sparkles-web-renderer')||card.querySelector('ytd-ad-slot-renderer,ytd-promoted-video-renderer,ytd-promoted-sparkles-web-renderer'))continue;
   let id,videoAnchor,shorts=false;
   for(const link of card.querySelectorAll('a[href]')){try{const url=new URL(link.getAttribute('href'),location.origin);if(!['https:','http:'].includes(url.protocol)||!['www.youtube.com','youtube.com','m.youtube.com'].includes(url.hostname))continue;const short=url.pathname.match(/^\/shorts\/([\w-]{11})(?:\/|$)/);const candidate=short?.[1]||(url.pathname==='/watch'?url.searchParams.get('v'):'');if(/^[\w-]{11}$/.test(candidate||'')){id=candidate;videoAnchor=link;shorts=!!short;break;}}catch{}}
   if(!id||id===currentVideo||seen.has(id)||options.exclude?.has(id))continue;
   const titleNode=card.querySelector('#video-title,.yt-lockup-metadata-view-model__title,.ytLockupMetadataViewModelTitle,.shortsLockupViewModelHostMetadataTitle,h3 a,h3,#video-title-link');
   const title=(titleNode?.getAttribute('title')||titleNode?.textContent||'').trim().slice(0,500);if(!title)continue;
   options.scanned?.set(card,{link:videoAnchor,href:videoAnchor.getAttribute('href'),title:titleNode,text:(titleNode.getAttribute('title')||titleNode.textContent||'').trim()});
   if(options.nodes&&!options.nodes.has(id))options.nodes.set(id,card);
   const channel=plain(card,'#channel-name a,ytd-channel-name a,#channel-name,.yt-content-metadata-view-model__metadata-row:first-child .yt-content-metadata-view-model__metadata-text,.ytContentMetadataViewModelMetadataRow:first-child .ytContentMetadataViewModelMetadataText,a[href^="/@"]').slice(0,200);
   const description=plain(card,'#description-text,#description,.metadata-snippet-text,.description-snippet').slice(0,1200);
   const duration=plain(card,'ytd-thumbnail-overlay-time-status-renderer,.yt-badge-shape__text,.ytBadgeShapeText,#time-status').slice(0,30);
   const metadata=(card.querySelector('#metadata-line')?[...card.querySelector('#metadata-line').children].map(n=>n.textContent.trim()).filter(Boolean).join(' · '):plain(card,'.yt-content-metadata-view-model__metadata-row:nth-child(2),.ytContentMetadataViewModelMetadataRow:nth-child(2)')).slice(0,120);
   let thumbnail=card.querySelector('img')?.getAttribute('src')||'';try{const image=new URL(thumbnail);if(image.protocol!=='https:'||!(image.hostname==='ytimg.com'||image.hostname.endsWith('.ytimg.com')))thumbnail='';}catch{thumbnail='';}
   seen.add(id);videos.push({id,title,channel,description,duration,metadata,shorts,thumbnail:thumbnail||`https://i.ytimg.com/vi/${id}/hqdefault.jpg`,hashtags:globalThis.IntentFeed.hashtags(title+' '+description)});if(videos.length>=limit)break;
  }return videos;
 }
 class Pagination{
  cancel(){this.finish?.({cancelled:true});}
  async load(primary,currentVideo='',known=[]){
   this.cancel();const before=new Set([...known,...read(primary,currentVideo,{limit:5000}).map(v=>v.id)]);
   const continuation=[...primary.querySelectorAll('ytd-continuation-item-renderer')].filter(n=>!n.closest('#intent-home-feed,#intent-watch-feed,[hidden],[data-intent-hidden],[data-intent-short-shelf],ytd-reel-shelf-renderer,ytd-rich-shelf-renderer,ytd-rich-section-renderer,yt-shelf-view-model,yt-grid-shelf-view-model')).at(-1);
   if(!continuation)return {available:false,added:false};
   return new Promise(resolve=>{
    let done=false,observer,timer;const restore=[];
    const style=(node,name,value)=>{const previous=node.style.getPropertyValue(name),priority=node.style.getPropertyPriority(name);restore.push(()=>previous?node.style.setProperty(name,previous,priority):node.style.removeProperty(name));node.style.setProperty(name,value,'important');};
    const finish=result=>{if(done)return;done=true;clearTimeout(timer);observer?.disconnect();restore.reverse().forEach(fn=>fn());this.finish=null;resolve({available:true,added:false,...result});};this.finish=finish;
    const check=()=>{if(!primary.isConnected)return finish({cancelled:true});if(read(primary,currentVideo,{exclude:before,limit:1}).length)finish({added:true});};
    observer=new MutationObserver(check);observer.observe(primary,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['href','title']});
    timer=setTimeout(()=>finish({}),12000);
    const button=continuation.querySelector('button:not(:disabled):not([aria-disabled="true"]),[role="button"]:not(:disabled):not([aria-disabled="true"])');
    if(button){button.click();queueMicrotask(check);return;}
    // The hidden native list cannot trigger its infinite-scroll sentinel. Give
    // only that sentinel a 1px intersecting box, keeping the native list full-width,
    // clipped, inert and inaccessible. Restore every owned change after one batch.
    let owner=continuation;while(owner.parentElement&&owner.parentElement!==primary)owner=owner.parentElement;
    const top=Math.max(60,document.querySelector('ytd-masthead')?.getBoundingClientRect().bottom+4||60)+'px',rect=primary.getBoundingClientRect(),left=Math.max(0,rect.left)+'px';
    // Home/Watch already owns a full-width hidden surface. Leave its geometry
    // alone so live resize updates cannot be overwritten by a pagination snapshot.
    if(!owner.hasAttribute('data-intent-recommendation-source')){
     for(const [name,value] of Object.entries({display:'block',position:'fixed',left,top,width:Math.max(120,rect.width||innerWidth)+'px',height:Math.max(1,innerHeight-parseFloat(top))+'px',overflow:'hidden',visibility:'hidden',opacity:'0','pointer-events':'none','z-index':'-1'}))style(owner,name,value);
     const hadInert=owner.hasAttribute('inert'),aria=owner.getAttribute('aria-hidden');owner.setAttribute('inert','');owner.setAttribute('aria-hidden','true');restore.push(()=>{if(!hadInert)owner.removeAttribute('inert');if(aria===null)owner.removeAttribute('aria-hidden');else owner.setAttribute('aria-hidden',aria);});
    }
    for(const [name,value] of Object.entries({display:'block',position:'fixed',left,top:'-100px',width:'1px',height:'1px','min-height':'1px','max-height':'1px'}))style(continuation,name,value);
    // A reused sentinel needs a real leave/re-enter frame; otherwise repeated
    // clicks can stay intersecting and never trigger YouTube's observer again.
    requestAnimationFrame(()=>requestAnimationFrame(()=>{if(done)return;style(continuation,'top',top);check();}));
   });
  }
 }
 globalThis.IntentRecommendations={read,Pagination};
})();
