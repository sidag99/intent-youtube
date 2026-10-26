/* Keep native YouTube elements in light DOM, slotted into the filtered layout.
   Existing recommendation controllers/listeners survive; discovery cards use the
   small validated page-world adapter and YouTube's own hover preference. */
(() => {
  class NativeCards {
    constructor(host,surface){this.host=host;this.surface=surface;this.entries=new Map();this.byNode=new WeakMap();this.sequence=0;this.ready=()=>this.flush();this.rendered=event=>{const entry=this.byNode.get(event.target);if(entry)this.reveal(entry);};document.addEventListener('intent-native-components-ready',this.ready);host.addEventListener('intent-native-card-ready',this.rendered);}
    supported(tag){return (document.documentElement?.getAttribute('data-intent-native-components')||'').split(',').includes(tag);}
    get(video,source){const entry=this.entries.get(video.id);if(!entry)return null;if(source&&!entry.original)this.upgrade(entry,source);return entry.card;}
    enhance(card,video,source){if(video.shorts)return;const slot=document.createElement('slot');slot.name=`intent-card-${this.surface}-${++this.sequence}`;const node=document.createElement('div');node.slot=slot.name;node.setAttribute('data-intent-native-card','');node.style.cssText='display:block;width:100%;min-width:0';const entry={card,video,node,slot,source};this.entries.set(video.id,entry);this.byNode.set(node,entry);card.append(slot);this.host.append(node);this.upgrade(entry,source);}
    upgrade(entry,source=entry.source){
      if(!entry.card||!entry.node.isConnected)return;
      if(source&&source.isConnected&&!source.closest('#intent-home-feed,#intent-watch-feed')&&this.supported(source.localName)){
        const placeholder=document.createComment('Intent native recommendation');source.parentNode.insertBefore(placeholder,source);
        const hadStyle=source.hasAttribute('style'),styles=new Map();for(const [name,value]of Object.entries({display:'block',width:'100%','min-width':'0','max-width':'none',margin:'0'})){styles.set(name,[source.style.getPropertyValue(name),source.style.getPropertyPriority(name)]);source.style.setProperty(name,value,'important');}
        entry.original={node:source,placeholder,styles,hadStyle};entry.node.replaceChildren(source);this.reveal(entry);return;
      }
      if(entry.original||entry.node.hasAttribute('data-intent-native-failed')||entry.node.hasAttribute('data-intent-native-rendered')||!this.supported(this.surface==='watch'?'ytd-compact-video-renderer':'ytd-rich-item-renderer'))return;
      entry.node.setAttribute('data-intent-native-request',JSON.stringify(entry.video));entry.node.dispatchEvent(new Event('intent-render-native-card',{bubbles:true}));
    }
    reveal(entry){entry.card.setAttribute('data-native-card-ready','');for(const child of entry.card.children)if(child!==entry.slot)child.hidden=true;}
    flush(){for(const entry of this.entries.values())this.upgrade(entry);}
    reset(){for(const entry of this.entries.values()){const original=entry.original;if(original){for(const [name,[value,priority]]of original.styles){if(value)original.node.style.setProperty(name,value,priority);else original.node.style.removeProperty(name);}if(!original.hadStyle&&!original.node.getAttribute('style')?.trim())original.node.removeAttribute('style');if(original.placeholder.parentNode)original.placeholder.replaceWith(original.node);else original.node.remove();}entry.node.remove();}this.entries.clear();this.byNode=new WeakMap();}
    destroy(){this.reset();document.removeEventListener('intent-native-components-ready',this.ready);this.host.removeEventListener('intent-native-card-ready',this.rendered);}
  }
  globalThis.IntentNativeCards=NativeCards;
})();
