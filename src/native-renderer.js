/* Page-world adapter for YouTube's own cards. It has no extension APIs. */
(() => {
  if (window.top !== window || !['www.youtube.com','youtube.com','m.youtube.com'].includes(location.hostname)) return;
  document.dispatchEvent(new Event('intent-native-renderer-dispose'));
  let disposed=false; const active=new WeakSet(),cleanups=new Set();
  const tags=['ytd-rich-item-renderer','ytd-compact-video-renderer','yt-lockup-view-model','ytd-rich-grid-media','ytd-video-renderer'];
  const signal=()=>{if(disposed||!document.documentElement)return;document.documentElement.setAttribute('data-intent-native-components',tags.filter(tag=>customElements.get(tag)).join(','));document.dispatchEvent(new Event('intent-native-components-ready'));};
  for(const tag of tags)customElements.whenDefined(tag).then(signal);
  signal(); if(!document.documentElement)document.addEventListener('DOMContentLoaded',signal,{once:true});
  const text=(value,n)=>typeof value==='string'?value.slice(0,n):'';
  function thumbnail(value,id){try{const u=new URL(value);if(u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(u.hostname==='ytimg.com'||u.hostname.endsWith('.ytimg.com')))return u.href;}catch{}return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;}
  function render(event){
    const host=event.target;
    if(disposed||!(host instanceof HTMLElement)||!host.hasAttribute('data-intent-native-request')||!host.closest('#intent-home-feed,#intent-watch-feed')||active.has(host))return;
    const raw=host.getAttribute('data-intent-native-request');if(!raw||raw.length>10000)return;
    let v;try{v=JSON.parse(raw);}catch{return;}
    if(!v||typeof v.id!=='string'||!/^[\w-]{11}$/.test(v.id)||!text(v.title,500).trim()||v.shorts===true)return;
    const tag=host.closest('#intent-watch-feed')?'ytd-compact-video-renderer':'ytd-rich-item-renderer';
    if(!customElements.get(tag))return; active.add(host);let cancel;
    try{
      const url='/watch?v='+v.id,endpoint={commandMetadata:{webCommandMetadata:{url,webPageType:'WEB_PAGE_TYPE_WATCH'}},watchEndpoint:{videoId:v.id}};
      const metadata=text(v.metadata,120).split(' · '),duration=text(v.duration,30),channel=text(v.channel,200);
      const data={videoId:v.id,title:{simpleText:text(v.title,500)},ownerText:{runs:[{text:channel}]},shortBylineText:{runs:[{text:channel}]},longBylineText:{runs:[{text:channel}]},thumbnail:{thumbnails:[{url:thumbnail(v.thumbnail,v.id),width:720,height:405}]},navigationEndpoint:endpoint,inlinePlaybackEndpoint:endpoint,viewCountText:{simpleText:metadata[0]||''},shortViewCountText:{simpleText:metadata[0]||''},publishedTimeText:{simpleText:metadata.slice(1).join(' · ')},lengthText:{simpleText:duration},thumbnailOverlays:duration?[{thumbnailOverlayTimeStatusRenderer:{text:{simpleText:duration},style:'DEFAULT'}}]:[],showActionMenu:false};
      try{const avatar=new URL(v.channelThumbnail);if(avatar.protocol==='https:'&&!avatar.username&&!avatar.password&&!avatar.port&&['yt3.ggpht.com','yt3.googleusercontent.com'].includes(avatar.hostname))data.channelThumbnailSupportedRenderers={channelThumbnailWithLinkRenderer:{thumbnail:{thumbnails:[{url:avatar.href,width:68,height:68}]}}};}catch{}
      try{const image=new URL(v.movingThumbnail);if(image.protocol==='https:'&&!image.username&&!image.password&&!image.port&&(image.hostname==='ytimg.com'||image.hostname.endsWith('.ytimg.com'))&&image.pathname.startsWith('/an_webp/'+v.id+'/'))data.richThumbnail={movingThumbnailRenderer:{movingThumbnailDetails:{thumbnails:[{url:image.href,width:320,height:180}]}}};}catch{}
      const node=document.createElement(tag);node.setAttribute('data-intent-created-card','');node.style.cssText='display:block!important;width:100%!important;min-width:0!important;max-width:none!important;margin:0!important';
      // Polymer's renderer cannot initialize inside an assigned slot on every
      // YouTube build. Initialize offscreen in ordinary light DOM, then move the
      // completed native component into its slot without cloning its controller.
      const stage=document.createElement('div');stage.setAttribute('data-intent-native-staging','');stage.setAttribute('aria-hidden','true');stage.inert=true;
      stage.style.cssText=`position:fixed;left:0;top:0;width:${Math.max(168,host.getBoundingClientRect().width||360)}px;height:1px;overflow:hidden;visibility:hidden;pointer-events:none;z-index:-1`;
      (document.body||document.documentElement).append(stage);stage.append(node);
      const payload=tag==='ytd-rich-item-renderer'?{content:{videoRenderer:data}}:data;
      let observer,timer;
      const cleanup=(failed=false)=>{observer?.disconnect();clearTimeout(timer);stage.remove();cleanups.delete(cleanup);if(failed){active.delete(host);host.setAttribute('data-intent-native-failed','');host.removeAttribute('data-intent-native-request');}};cancel=cleanup;cleanups.add(cleanup);
      const ready=()=>{
        if(disposed||!host.isConnected){cleanup(true);return;}
        if(!node.querySelector('a[href*="watch"]')||!node.querySelector('#video-title,h3'))return;
        host.replaceChildren(node);cleanup();host.setAttribute('data-intent-native-rendered','');host.removeAttribute('data-intent-native-request');host.dispatchEvent(new Event('intent-native-card-ready',{bubbles:true}));
      };
      observer=new MutationObserver(ready);observer.observe(node,{childList:true,subtree:true,characterData:true});
      timer=setTimeout(()=>cleanup(true),2500);node.data=payload;ready();
    }catch{cancel?.(true);active.delete(host);}
  }
  function dispose(){disposed=true;for(const cleanup of [...cleanups])cleanup();document.removeEventListener('intent-render-native-card',render);document.removeEventListener('intent-native-renderer-dispose',dispose);document.removeEventListener('DOMContentLoaded',signal);}
  document.addEventListener('intent-render-native-card',render);document.addEventListener('intent-native-renderer-dispose',dispose);
})();
