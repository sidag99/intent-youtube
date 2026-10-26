/* Role presets are editable starting points, separate from applied intent settings. */
(() => {
  const escape = value => String(value).replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
  class RolePresets {
    constructor({getSettings, update}) {this.getSettings = getSettings; this.update = update;}
    render() {
      const host = document.getElementById('role-presets');
      if (!host) return;
      const settings = this.getSettings(), presets = settings.rolePresets;
      if (!Object.hasOwn(presets, this.selected)) this.selected = Object.hasOwn(presets, settings.lastRolePreset) ? settings.lastRolePreset : Object.keys(presets)[0];
      const preset = presets[this.selected];
      host.innerHTML = `<div class="section-head"><h2>Role presets</h2><button type="button" class="button secondary" id="new-role-preset" ${Object.keys(presets).length >= 20 ? 'disabled' : ''}>New preset</button></div><p class="section-copy">Role presets tailor Work and Study to your professional and learning goals. They leave music and personal interests to your own intents. Each intent stays editable after applying a preset.</p>${preset ? `<label for="role-preset-select">Choose a role preset</label><select id="role-preset-select">${Object.entries(presets).map(([id, record]) => `<option value="${id}" ${id === this.selected ? 'selected' : ''}>${escape(record.name)}</option>`).join('')}</select><div class="role-preview" aria-live="polite"><div><h3>Work</h3><p>${escape(preset.workDescription || 'Standard built-in Work scope. See its intent editor for the full defaults.')}</p></div><div><h3>Study</h3><p>${escape(preset.studyDescription || 'Standard built-in Study scope. See its intent editor for the full defaults.')}</p></div></div><div class="role-actions"><button type="button" class="button primary" id="apply-role-preset">Apply preset</button><button type="button" class="text-button" id="edit-role-preset">Edit preset</button><button type="button" class="text-button danger-button" id="delete-role-preset">Delete preset</button></div><p class="field-hint">Applies only the Work and Study descriptions. Names, extra topics, channels, other intents and timer settings stay as you set them. Editing or deleting a saved preset does not change descriptions you already applied.</p>` : '<p class="section-copy">No saved presets. Create one, or keep editing your intents directly.</p>'}<p class="field-hint">${Object.keys(presets).length} / 20 presets. Factory reset restores the original role presets.</p>`;
      host.querySelector('#role-preset-select')?.addEventListener('change', event => {this.selected = event.target.value; this.render(); host.querySelector('#role-preset-select')?.focus();});
      host.querySelector('#new-role-preset').onclick = () => this.edit();
      host.querySelector('#edit-role-preset')?.addEventListener('click', () => this.edit(this.selected));
      host.querySelector('#delete-role-preset')?.addEventListener('click', () => this.remove(this.selected));
      host.querySelector('#apply-role-preset')?.addEventListener('click', async event => {
        const current = this.getSettings(), choice = current.rolePresets[this.selected];
        if (!choice) return;
        event.target.disabled = true;
        const ok = await this.update({intentDescriptions: {...current.intentDescriptions, work: choice.workDescription, study: choice.studyDescription}, lastRolePreset: this.selected}, `${choice.name} applied to Work and Study. Each intent is still editable.`);
        if (!ok && event.target.isConnected) event.target.disabled = false;
      });
    }
    dialog(id, contents) {
      this.openDialog?.remove();
      const dialog = this.openDialog = document.createElement('dialog'); dialog.id = id; dialog.className = 'role-preset-dialog'; dialog.innerHTML = contents;
      document.body.append(dialog);
      const close = () => {dialog.close(); dialog.remove(); if (this.openDialog === dialog) this.openDialog = null;};
      dialog.addEventListener('cancel', event => {event.preventDefault(); close();});
      dialog.querySelector('[data-close]').onclick = close;
      dialog.showModal(); return {dialog, close};
    }
    edit(id) {
      const preset = this.getSettings().rolePresets[id] || {name: '', workDescription: '', studyDescription: ''};
      const {dialog, close} = this.dialog('role-preset-editor', `<header class="dialog-heading"><h2 id="role-editor-heading">${id ? 'Edit role preset' : 'New role preset'}</h2><button type="button" class="icon-button" data-close aria-label="Close preset editor">×</button></header><p>Save a reusable starting point for your Work and Study goals. Apply it separately to update those two intents; music and other intents keep their own settings.</p><form><label for="role-preset-name">Preset name</label><input id="role-preset-name" maxlength="48" required value="${escape(preset.name)}"><label for="role-work-description">Work intent description</label><textarea id="role-work-description" maxlength="1000" rows="4">${escape(preset.workDescription)}</textarea><label for="role-study-description">Study intent description</label><textarea id="role-study-description" maxlength="1000" rows="4">${escape(preset.studyDescription)}</textarea><p class="field-hint">A blank description uses that intent's standard built-in scope, shown in its intent editor.</p><p class="role-error" role="alert"></p><div class="dialog-actions"><button type="submit" class="button primary">Save preset</button></div></form>`);
      dialog.setAttribute('aria-labelledby', 'role-editor-heading');
      dialog.querySelector('form').onsubmit = async event => {
        event.preventDefault();
        const name = dialog.querySelector('#role-preset-name').value.trim();
        if (!name) {dialog.querySelector('#role-preset-name').focus(); return;}
        const settings = this.getSettings(), key = id || 'custom-' + crypto.randomUUID().slice(0, 8);
        if (!id && Object.keys(settings.rolePresets).length >= 20) {dialog.querySelector('.role-error').textContent = 'You can save up to 20 presets. Delete one before adding another.'; return;}
        const record = {name, workDescription: dialog.querySelector('#role-work-description').value.trim(), studyDescription: dialog.querySelector('#role-study-description').value.trim()};
        const button = dialog.querySelector('[type=submit]'); button.disabled = true; this.selected = key;
        const ok = await this.update({rolePresets: {...settings.rolePresets, [key]: record}}, 'Role preset saved. Apply it when you want to update Work and Study.');
        if (ok) close(); else {button.disabled = false; dialog.querySelector('.role-error').textContent = 'The preset could not be saved. Try again.';}
      };
    }
    remove(id) {
      const preset = this.getSettings().rolePresets[id]; if (!preset) return;
      const {dialog, close} = this.dialog('delete-role-preset-dialog', `<h2 id="role-delete-heading">Delete ${escape(preset.name)} preset?</h2><p>This removes the saved preset. Your current intent descriptions stay unchanged. Factory reset restores original built-in presets.</p><p class="role-error" role="alert"></p><div class="dialog-actions"><button type="button" class="button" data-close>Cancel</button><button type="button" class="button primary" id="confirm-delete-role-preset">Delete preset</button></div>`);
      dialog.setAttribute('aria-labelledby', 'role-delete-heading');
      dialog.querySelector('#confirm-delete-role-preset').onclick = async event => {
        event.target.disabled = true;
        const settings = this.getSettings(), rolePresets = {...settings.rolePresets}; delete rolePresets[id];
        const ok = await this.update({rolePresets, ...(settings.lastRolePreset === id ? {lastRolePreset: null} : {})}, 'Role preset deleted. Your current intents are unchanged.');
        if (ok) close(); else {event.target.disabled = false; dialog.querySelector('.role-error').textContent = 'The preset could not be deleted. Try again.';}
      };
    }
  }
  globalThis.IntentRolePresets = RolePresets;
})();
