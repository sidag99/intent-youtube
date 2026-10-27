/* Page-world adapter for YouTube's own cards. It has no extension APIs. */
(() => {
  if (window.top !== window || !['www.youtube.com','youtube.com','m.youtube.com'].includes(location.hostname)) return;
  document.dispatchEvent(new Event('intent-native-renderer-dispose'));
  let disposed=false,published; const active=new WeakSet(),cleanups=new Set();
  const tags=['ytd-rich-item-renderer','ytd-compact-video-renderer','yt-lockup-view-model','ytd-rich-grid-media','ytd-video-renderer'];
  const signal=()=>{if(disposed||!document.documentElement)return;const available=tags.filter(tag=>customElements.get(tag)).join(',');if(available===published)return;published=available;document.documentElement.setAttribute('data-intent-native-components',available);document.dispatchEvent(new Event('intent-native-components-ready'));};
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
      // Follow the page's Home renderer variant instead of forcing the older
      // rich-grid-media title/channel/view arrangement on a modern lockup feed.
      const browse=host.closest('ytd-browse');
      const modern=tag==='ytd-rich-item-renderer'&&browse&&[...browse.querySelectorAll('yt-lockup-view-model')].find(item=>!item.closest('[data-intent-created-card]'));
      let content={videoRenderer:data};
      if(modern){
        const rows=[{metadataParts:[{text:{content:channel}}]},{metadataParts:metadata.filter(Boolean).map((value,index)=>({text:{content:value},...(index===0?{leadingIcon:{name:'PLAY_ARROW_OUTLINED',height:12,width:12,marginEndToken:{spacing:2}}}:{})}))}];
        if(modern.querySelectorAll('.ytContentMetadataViewModelMetadataRow,.yt-content-metadata-view-model__metadata-row').length===1)rows.splice(0,rows.length,{metadataParts:rows.flatMap(row=>row.metadataParts)});
        const model={itemPlayback:{inlinePlayerData:{onSelect:{innertubeCommand:endpoint},onVisible:{innertubeCommand:endpoint}}},contentId:v.id,contentType:'LOCKUP_CONTENT_TYPE_VIDEO',contentImage:{thumbnailViewModel:{image:{sources:data.thumbnail.thumbnails},overlays:duration?[{thumbnailBottomOverlayViewModel:{badges:[{thumbnailBadgeViewModel:{text:duration,badgeStyle:'THUMBNAIL_OVERLAY_BADGE_STYLE_DEFAULT'}}]}}]:[]}},metadata:{lockupMetadataViewModel:{title:{content:data.title.simpleText},metadata:{contentMetadataViewModel:{metadataRows:rows,delimiter:modern.querySelector('.ytContentMetadataViewModelDelimiter,.yt-content-metadata-view-model__delimiter')?.textContent||' '}}}},rendererContext:{commandContext:{onTap:{innertubeCommand:endpoint}}}};
        const artwork=data.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer.thumbnail;
        if(artwork)model.metadata.lockupMetadataViewModel.image={decoratedAvatarViewModel:{avatar:{avatarViewModel:{image:{sources:artwork.thumbnails}}},a11yLabel:channel}};
        const moving=data.richThumbnail?.movingThumbnailRenderer.movingThumbnailDetails;
        if(moving)model.contentImage.thumbnailViewModel.overlays.push({animatedThumbnailOverlayViewModel:{thumbnail:{sources:moving.thumbnails}}});
        content={lockupViewModel:model};
      }
      const payload=tag==='ytd-rich-item-renderer'?{content}:data;
      let observer,timer;
      const cleanup=(failed=false)=>{observer?.disconnect();clearTimeout(timer);stage.remove();cleanups.delete(cleanup);active.delete(host);if(failed&&host.getAttribute('data-intent-native-request')===raw){host.setAttribute('data-intent-native-failed','');host.removeAttribute('data-intent-native-request');}};cancel=cleanup;cleanups.add(cleanup);
      const ready=()=>{
        if(disposed||!host.isConnected||host.getAttribute('data-intent-native-request')!==raw){cleanup();return;}
        if(!node.querySelector('a[href*="watch"]')||!node.querySelector('#video-title,h3'))return;
        host.replaceChildren(node);cleanup();host.setAttribute('data-intent-native-rendered','');host.removeAttribute('data-intent-native-request');host.dispatchEvent(new Event('intent-native-card-ready',{bubbles:true}));
      };
      observer=new MutationObserver(ready);observer.observe(node,{childList:true,subtree:true,characterData:true});
      timer=setTimeout(()=>cleanup(true),2500);node.data=payload;ready();
    }catch{cancel?.(true);active.delete(host);}
  }
  function dispose(){disposed=true;for(const cleanup of [...cleanups])cleanup();document.removeEventListener('intent-render-native-card',render);document.removeEventListener('intent-native-renderer-dispose',dispose);document.removeEventListener('DOMContentLoaded',signal);}
  document.addEventListener('intent-render-native-card',render);document.addEventListener('intent-native-renderer-dispose',dispose);
  for(const tag of tags)customElements.whenDefined(tag).then(signal);
  signal(); if(!document.documentElement)document.addEventListener('DOMContentLoaded',signal,{once:true});
})();
