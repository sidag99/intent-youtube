/* Keep native YouTube elements in light DOM, slotted into the filtered layout.
   Existing recommendation controllers/listeners survive; discovery cards use the
   small validated page-world adapter and YouTube's own hover preference. */
(() => {
  class NativeCards {
    constructor(host,surface){this.host=host;this.surface=surface;this.entries=new Map();this.byNode=new WeakMap();this.dirty=new Set();this.sequence=0;this.ready=()=>this.flush();this.rendered=event=>{const entry=this.byNode.get(event.target);if(entry)this.reveal(entry);};this.observer=new MutationObserver(records=>this.changed(records));this.observe();document.addEventListener('intent-native-components-ready',this.ready);host.addEventListener('intent-native-card-ready',this.rendered);}
    observe(){this.observer.observe(this.host,{childList:true,subtree:true,characterData:true});}
    changed(records){
      if(this.surface==='home'&&this.layoutPrimary)this.syncLayout(this.layoutPrimary);
      const mark=node=>{for(let current=node;current&&current!==this.host;current=current.parentNode){const entry=this.byNode.get(current);if(entry){if(this.entries.get(entry.video.id)===entry)this.dirty.add(entry);break;}}};
      for(const record of records){mark(record.target);for(const node of record.addedNodes)mark(node);for(const node of record.removedNodes)mark(node);}
      if(!this.dirty.size||this.frame!=null)return;
      this.frame=requestAnimationFrame(()=>{this.frame=null;for(const entry of this.dirty){const healthy=entry.node.parentNode===this.host&&entry.node.querySelector('a[href*="watch"],a[href*="/playlist?"]')&&entry.node.querySelector('#video-title,h3');if(healthy)this.reveal(entry);else this.fallback(entry);}this.dirty.clear();});
    }
    syncLayout(primary){
      if(this.surface!=='home'||this.destroyed)return;
      this.layoutPrimary=primary;
      const collection=node=>[...node.querySelectorAll('a[href]')].some(link=>{try{const url=new URL(link.getAttribute('href'),location.origin);return url.pathname==='/playlist'||url.pathname==='/watch'&&url.searchParams.has('list');}catch{return false;}});
      const sample=root=>[...root?.querySelectorAll('yt-lockup-view-model')||[]].find(node=>!node.closest('[data-intent-created-card],[hidden]')&&!collection(node)&&node.querySelectorAll('.ytContentMetadataViewModelMetadataRow,.yt-content-metadata-view-model__metadata-row').length);
      // Moved recommendations are the authoritative visible layout. A generated
      // card must never become its own template after the source is filtered.
      const originals=[...this.entries.values()].filter(entry=>entry.original&&entry.original.node.isConnected&&this.host.contains(entry.original.node)&&entry.video.type!=='playlist').map(entry=>entry.original.node.matches('yt-lockup-view-model')?entry.original.node:entry.original.node.querySelector('yt-lockup-view-model')).filter(node=>node&&!collection(node));
      // If a moved original temporarily clears its metadata, retain the last
      // known layout instead of adopting a stale offscreen recommendation.
      const native=originals.find(node=>node.querySelectorAll('.ytContentMetadataViewModelMetadataRow,.yt-content-metadata-view-model__metadata-row').length)||originals[0]||sample(primary);
      if(!native){this.layoutCandidate=null;return;}
      const rows=[...native.querySelectorAll('.ytContentMetadataViewModelMetadataRow,.yt-content-metadata-view-model__metadata-row')];
      if(rows.length<1||rows.length>2||rows.some(row=>!row.textContent.trim())){this.layoutCandidate=null;return;}
      const delimiter=native.querySelector('.ytContentMetadataViewModelDelimiter,.yt-content-metadata-view-model__delimiter')?.textContent??' ';
      if(delimiter.length>8){this.layoutCandidate=null;return;}
      const key=JSON.stringify({rows:rows.length,delimiter,play:!!native.querySelector('.ytContentMetadataViewModelLeadingIcon,.yt-content-metadata-view-model__leading-icon')});
      if(key===this.layoutKey){this.layoutCandidate=null;return;}
      if(key!==this.layoutCandidate){
        this.layoutCandidate=key;
        if(this.layoutFrame==null)this.layoutFrame=requestAnimationFrame(()=>{this.layoutFrame=null;this.syncLayout(this.layoutPrimary);});
        return;
      }
      if(this.layoutFrame!=null)return;
      this.layoutCandidate=null;this.layoutKey=key;this.host.setAttribute('data-intent-native-home-layout',key);this.flush();
    }
    fallback(entry){entry.card.removeAttribute('data-native-card-ready');entry.slot.hidden=true;for(const child of entry.card.children)if(child!==entry.slot)child.hidden=false;}
    supported(tag){return (document.documentElement?.getAttribute('data-intent-native-components')||'').split(',').includes(tag);}
    get(video,source){const entry=this.entries.get(video.id);if(!entry)return null;if(source&&!entry.original)this.upgrade(entry,source);return entry.card;}
    enhance(card,video,source){if(video.shorts||video.type==='playlist'&&!source)return;const slot=document.createElement('slot');slot.name=`intent-card-${this.surface}-${++this.sequence}`;const node=document.createElement('div');node.slot=slot.name;node.setAttribute('data-intent-native-card','');node.style.cssText='display:block;width:100%;min-width:0';const entry={card,video,node,slot,source};this.entries.set(video.id,entry);this.byNode.set(node,entry);card.append(slot);this.host.append(node);this.upgrade(entry,source);}
    upgrade(entry,source=entry.source){
      if(!entry.card||!entry.node.isConnected)return;
      if(source&&source.isConnected&&!source.closest('#intent-home-feed,#intent-watch-feed')&&this.supported(source.localName)){
        const placeholder=document.createComment('Intent native recommendation');source.parentNode.insertBefore(placeholder,source);
        const hadStyle=source.hasAttribute('style'),styles=new Map();for(const [name,value]of Object.entries({display:'block',width:'100%','min-width':'0','max-width':'none',margin:'0'})){styles.set(name,[source.style.getPropertyValue(name),source.style.getPropertyPriority(name)]);source.style.setProperty(name,value,'important');}
        entry.node.removeAttribute('data-intent-native-request');
        entry.original={node:source,placeholder,styles,hadStyle};entry.node.replaceChildren(source);this.reveal(entry);return;
      }
      const layout=this.surface==='home'?this.host.getAttribute('data-intent-native-home-layout')||'':'';
      if(layout&&!entry.original&&entry.layoutRequested!==layout){entry.layoutRequested=layout;entry.node.removeAttribute('data-intent-native-rendered');entry.node.removeAttribute('data-intent-native-failed');}
      const modernWatch=this.surface==='watch'&&this.host.dataset.nativeWatchRenderer==='modern'&&(this.supported('ytd-rich-item-renderer')||this.supported('ytd-item-section-renderer'));
      if(modernWatch&&entry.node.getAttribute('data-intent-native-variant')==='compact'&&!entry.original)entry.node.removeAttribute('data-intent-native-rendered');
      const available=this.surface==='watch'?this.supported('ytd-compact-video-renderer')||this.host.dataset.nativeWatchRenderer==='modern'&&(this.supported('ytd-rich-item-renderer')||this.supported('ytd-item-section-renderer')):this.supported('ytd-rich-item-renderer');
      if(entry.video.type==='playlist'||entry.original||entry.node.hasAttribute('data-intent-native-failed')||entry.node.hasAttribute('data-intent-native-rendered')||!available)return;
      entry.node.setAttribute('data-intent-native-request',JSON.stringify(layout?{...entry.video,_intentLayoutKey:layout}:entry.video));entry.node.dispatchEvent(new Event('intent-render-native-card',{bubbles:true}));
    }
    reveal(entry){entry.card.setAttribute('data-native-card-ready','');entry.slot.hidden=false;for(const child of entry.card.children)if(child!==entry.slot)child.hidden=true;}
    flush(){for(const entry of this.entries.values())this.upgrade(entry);}
    release(ids){
      for(const id of ids){const entry=this.entries.get(id);if(!entry)continue;const original=entry.original;
        entry.node.removeAttribute('data-intent-native-request');
        if(original){for(const [name,[value,priority]]of original.styles){if(value)original.node.style.setProperty(name,value,priority);else original.node.style.removeProperty(name);}if(!original.hadStyle&&!original.node.getAttribute('style')?.trim())original.node.removeAttribute('style');if(original.placeholder.parentNode)original.placeholder.replaceWith(original.node);else original.node.remove();}
        entry.node.remove();this.byNode.delete(entry.node);this.dirty.delete(entry);this.entries.delete(id);
      }
      if(!this.dirty.size&&this.frame!=null){cancelAnimationFrame(this.frame);this.frame=null;}
    }
    reset(){this.observer.disconnect();if(this.layoutFrame!=null)cancelAnimationFrame(this.layoutFrame);this.layoutFrame=null;this.layoutCandidate=null;if(this.frame!=null)cancelAnimationFrame(this.frame);this.frame=null;this.dirty.clear();this.release([...this.entries.keys()]);this.byNode=new WeakMap();if(!this.destroyed)this.observe();}
    destroy(){this.destroyed=true;this.reset();document.removeEventListener('intent-native-components-ready',this.ready);this.host.removeEventListener('intent-native-card-ready',this.rendered);}
  }
  globalThis.IntentNativeCards=NativeCards;
})();
