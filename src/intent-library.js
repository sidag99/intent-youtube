/* Optional intent templates and custom-intent creation. Ordering lives on the intent cards. */
(() => {
  const C = IntentCore;
  const escape = value => String(value).replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
  const icon = key => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${C.INTENT_ICON_PATHS[key] || C.INTENT_ICON_PATHS.compass}</svg>`;
  class IntentLibrary {
    constructor({getSettings, update, onCreate = () => {}}) {this.getSettings = getSettings; this.update = update; this.onCreate = onCreate; this.search = ''; this.catalogueOpen = false;}
    render() {
      const host = document.getElementById('intent-library'); if (!host) return;
      const settings = this.getSettings(), installed = Object.values(settings.customIntents);
      host.innerHTML = `<div class="section-head"><h2>Add an intent</h2><button type="button" class="button primary" id="new-intent" ${installed.length >= C.MAX_CUSTOM_INTENTS ? 'disabled' : ''}>Create your own intent</button></div><details id="intent-catalogue" ${this.catalogueOpen ? 'open' : ''}><summary>Add from the intent library</summary><p class="section-copy">Add only the modes you want. Each template becomes an editable intent with its own icon and timer rule.</p><label class="visually-hidden" for="template-search">Find an intent template</label><input type="search" id="template-search" placeholder="Find a mode…" value="${escape(this.search)}"><div class="template-grid">${Object.entries(C.INTENT_TEMPLATES).map(([id, template]) => {
        const added = installed.some(record => record.templateId === id);
        return `<article class="intent-template" data-template="${id}" ${this.matches(template) ? '' : 'hidden'}><h3><span class="intent-template-icon" aria-hidden="true">${icon(template.icon)}</span> ${escape(template.name)}</h3><p>${escape(template.description)}</p><details class="template-topics"><summary>Included topics</summary><p>${template.topics.map(escape).join(', ')}</p></details><button type="button" class="button" data-add-template="${id}" ${added || installed.length >= C.MAX_CUSTOM_INTENTS ? 'disabled' : ''}>${added ? 'Added' : 'Add intent'}</button></article>`;
      }).join('')}</div><p class="field-hint">${installed.length} / ${C.MAX_CUSTOM_INTENTS} optional and custom intents. Remove any of these through its pencil editor.</p><p class="template-empty" ${Object.values(C.INTENT_TEMPLATES).some(template => this.matches(template)) ? 'hidden' : ''}>No templates match. Use Create your own intent above.</p></details>`;
      host.querySelector('#new-intent').onclick = () => this.onCreate();
      host.querySelector('#intent-catalogue').addEventListener('toggle', event => {this.catalogueOpen = event.target.open;});
      host.querySelector('#template-search').addEventListener('input', event => {
        this.search = event.target.value;
        for (const card of host.querySelectorAll('[data-template]')) card.hidden = !this.matches(C.INTENT_TEMPLATES[card.dataset.template]);
        host.querySelector('.template-empty').hidden = Object.values(C.INTENT_TEMPLATES).some(template => this.matches(template));
      });
      for (const button of host.querySelectorAll('[data-add-template]')) button.onclick = async () => {
        const settings = this.getSettings(), templateId = button.dataset.addTemplate, template = C.INTENT_TEMPLATES[templateId];
        if (!template || Object.values(settings.customIntents).some(record => record.templateId === templateId) || Object.keys(settings.customIntents).length >= C.MAX_CUSTOM_INTENTS) return;
        let id = 'custom-' + templateId;
        if (Object.hasOwn(settings.customIntents, id)) id += '-' + crypto.randomUUID().slice(0, 8);
        button.disabled = true;
        const ok = await this.update({customIntents: {...settings.customIntents, [id]: {name: template.name, description: template.description, icon: template.icon, templateId}}, intentOrder: [...Object.keys(C.modes(settings)), id]}, `${template.name} added. Use its pencil to customize it.`);
        if (!ok && button.isConnected) button.disabled = false;
      };

    }
    matches(template) {return `${template.name} ${template.description} ${(template.topics || []).join(' ')}`.toLocaleLowerCase().includes(this.search.trim().toLocaleLowerCase());}
  }
  globalThis.IntentLibrary = IntentLibrary;
})();
