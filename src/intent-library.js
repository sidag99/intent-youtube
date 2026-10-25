/* Optional intent templates and an accessible, persistent installed-intent order. */
(() => {
  const C = IntentCore;
  const escape = value => String(value).replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
  class IntentLibrary {
    constructor({getSettings, update}) {this.getSettings = getSettings; this.update = update; this.search = ''; this.catalogueOpen = false; this.orderOpen = false;}
    render() {
      const host = document.getElementById('intent-library'); if (!host) return;
      const settings = this.getSettings(), modes = C.modes(settings), ids = Object.keys(modes), installed = Object.values(settings.customIntents);
      host.innerHTML = `<details id="intent-catalogue" ${this.catalogueOpen ? 'open' : ''}><summary>Add from the intent library</summary><p class="section-copy">Add only the modes you want. Each template becomes an editable intent with its own icon and timer rule.</p><label class="visually-hidden" for="template-search">Find an intent template</label><input type="search" id="template-search" placeholder="Find a mode…" value="${escape(this.search)}"><div class="template-grid">${Object.entries(C.INTENT_TEMPLATES).map(([id, template]) => {
        const added = installed.some(record => record.templateId === id);
        return `<article class="intent-template" data-template="${id}" ${this.matches(template) ? '' : 'hidden'}><h3><span aria-hidden="true">${escape(C.INTENT_ICONS[template.icon] || template.symbol || '◎')}</span> ${escape(template.name)}</h3><p>${escape(template.description)}</p><button type="button" class="button" data-add-template="${id}" ${added || installed.length >= C.MAX_CUSTOM_INTENTS ? 'disabled' : ''}>${added ? 'Added' : 'Add intent'}</button></article>`;
      }).join('')}</div><p class="field-hint">${installed.length} / ${C.MAX_CUSTOM_INTENTS} optional and custom intents. Remove any of these through its pencil editor.</p><p class="template-empty" ${Object.values(C.INTENT_TEMPLATES).some(template => this.matches(template)) ? 'hidden' : ''}>No templates match. You can create your own intent below.</p></details><details id="intent-order" ${this.orderOpen ? 'open' : ''}><summary>Arrange intents</summary><p class="section-copy">This order is used in the toolbar, popup and settings.</p><ol id="intent-order-list">${ids.map((id, index) => `<li><span class="order-name"><span aria-hidden="true">${escape(modes[id].symbol)}</span> ${escape(modes[id].name)}</span><button type="button" class="icon-button" data-move-intent="${id}" data-direction="-1" aria-label="Move ${escape(modes[id].name)} up" ${index === 0 ? 'disabled' : ''}>↑</button><button type="button" class="icon-button" data-move-intent="${id}" data-direction="1" aria-label="Move ${escape(modes[id].name)} down" ${index === ids.length - 1 ? 'disabled' : ''}>↓</button></li>`).join('')}</ol></details>`;
      host.querySelector('#intent-catalogue').addEventListener('toggle', event => {this.catalogueOpen = event.target.open;});
      host.querySelector('#intent-order').addEventListener('toggle', event => {this.orderOpen = event.target.open;});
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
      for (const button of host.querySelectorAll('[data-move-intent]')) button.onclick = async () => {
        const ids = Object.keys(C.modes(this.getSettings())), index = ids.indexOf(button.dataset.moveIntent), next = index + Number(button.dataset.direction);
        if (index < 0 || next < 0 || next >= ids.length) return;
        [ids[index], ids[next]] = [ids[next], ids[index]]; button.disabled = true;
        const ok = await this.update({intentOrder: ids}, 'Intent order saved.');
        if (ok) document.querySelector(`[data-move-intent="${button.dataset.moveIntent}"][data-direction="${button.dataset.direction}"]`)?.focus();
        else if (button.isConnected) button.disabled = false;
      };
    }
    matches(template) {return `${template.name} ${template.description}`.toLocaleLowerCase().includes(this.search.trim().toLocaleLowerCase());}
  }
  globalThis.IntentLibrary = IntentLibrary;
})();
