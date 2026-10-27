let currentTabId;
const currentTab = chrome.tabs.getCurrent().then(tab => { currentTabId = tab?.id; }).catch(() => {});
async function closeTab() {
  await currentTab;
  if (Number.isInteger(currentTabId)) await chrome.tabs.remove(currentTabId);
}
async function refresh() {
  try {
    await currentTab;
    const state = await chrome.runtime.sendMessage({type: 'GET_STATE', targetTabId: currentTabId});
    if (!state.ok) throw new Error(state.error);
    if (['light', 'dark'].includes(state.appearance)) document.documentElement.dataset.theme = state.appearance;
    const choices = Object.entries(IntentCore.modes(state.settings)).filter(([mode]) => !IntentCore.countsMode(state.settings, mode)).map(([mode, item]) => [mode, item.name]);
    if (!IntentCore.countsMode(state.settings, 'off')) choices.push(['off', 'Modes off']);
    const exemptions = document.querySelector('#exempt-modes');
    exemptions.hidden = !state.blocked || !choices.length;
    const select = document.querySelector('#exempt-intent');
    const signature = JSON.stringify(choices);
    if (select.dataset.options !== signature) {
      select.dataset.options = signature;
      select.replaceChildren(...choices.map(([value, name]) => { const option = document.createElement('option'); option.value = value; option.textContent = name; return option; }));
    }
    if (!state.blocked) {
      document.querySelector('h1').textContent = state.tabPaused ? 'Intent is paused on this tab.' : state.timerExempt && state.budgetExhausted ? 'Your intent is still available.' : 'A fresh start is waiting.';
      document.querySelector('#block-detail').textContent = state.tabPaused ? 'Filters and timer counting are paused here. Other tabs keep their settings. Resume Intent from the toolbar or popup.' : state.timerExempt ? 'This intent is excluded from your daily timer. You can keep using it.' : 'Your YouTube budget is available again.';
      document.querySelector('#reset-label').textContent = 'Go in with an intention.';
      const button = document.querySelector('#close-tab');
      button.textContent = 'Return to YouTube →';
      button.onclick = () => location.assign('https://www.youtube.com/');
    } else {
      document.querySelector('h1').innerHTML = 'There’s a whole world<br>outside this tab.';
      const button = document.querySelector('#close-tab');
      button.textContent = 'Close this tab ↗'; button.onclick = closeTab;
      document.querySelector('#block-detail').textContent = `You’ve reached your ${state.settings.dailyMinutes}-minute daily budget for counted intents. Timer-exempt intents remain available.`;
      const remaining = Math.max(0, state.resetAt - Date.now());
      const hours = Math.floor(remaining / 3600000), minutes = Math.ceil((remaining % 3600000) / 60000);
      document.querySelector('#reset-label').textContent = `Your budget resets in ${hours}h ${minutes}m`;
    }
  } catch { document.querySelector('#reset-label').textContent = 'Open Intent settings to check your budget.'; }
}
chrome.runtime.onMessage?.addListener(message => {
  if (message.type === 'APPEARANCE' && ['light', 'dark'].includes(message.appearance)) document.documentElement.dataset.theme = message.appearance;
  if (message.type === 'SETTINGS') refresh();
});
document.querySelector('#continue-exempt').onclick = async () => {
  await currentTab;
  const button = document.querySelector('#continue-exempt'); button.disabled = true;
  try {
    if (!Number.isInteger(currentTabId)) throw new Error('Open Intent from this tab to choose another intent.');
    const result = await chrome.runtime.sendMessage({type: 'UPDATE_SETTINGS', targetTabId: currentTabId, patch: {mode: document.querySelector('#exempt-intent').value}});
    if (!result?.ok) throw new Error(result?.error || 'This intent could not be selected.');
    location.assign('https://www.youtube.com/');
  } catch (error) { document.querySelector('#reset-label').textContent = error.message; button.disabled = false; }
};
document.querySelector('#close-tab').onclick = closeTab;
refresh(); setInterval(refresh, 15000);
