async function refresh() {
  try {
    const state = await chrome.runtime.sendMessage({type: 'GET_STATE'});
    if (!state.ok) throw new Error(state.error);
    if (['light', 'dark'].includes(state.appearance)) document.documentElement.dataset.theme = state.appearance;
    if (!state.blocked) {
      document.querySelector('h1').textContent = 'A fresh start is waiting.';
      document.querySelector('#block-detail').textContent = 'Your YouTube budget is available again.';
      document.querySelector('#reset-label').textContent = 'Go in with an intention.';
      const button = document.querySelector('#close-tab');
      button.textContent = 'Return to YouTube →';
      button.onclick = () => location.assign('https://www.youtube.com/');
    } else {
      document.querySelector('#block-detail').textContent = `You’ve reached your ${state.settings.dailyMinutes}-minute daily YouTube budget. Your next fresh start is at local midnight.`;
      const remaining = Math.max(0, state.resetAt - Date.now());
      const hours = Math.floor(remaining / 3600000), minutes = Math.ceil((remaining % 3600000) / 60000);
      document.querySelector('#reset-label').textContent = `Your budget resets in ${hours}h ${minutes}m`;
    }
  } catch { document.querySelector('#reset-label').textContent = 'Open Intent settings to check your budget.'; }
}
chrome.runtime.onMessage?.addListener(message => {
  if (message.type === 'APPEARANCE' && ['light', 'dark'].includes(message.appearance)) document.documentElement.dataset.theme = message.appearance;
});
document.querySelector('#close-tab').onclick = async () => {
  const tab = await chrome.tabs.getCurrent();
  if (tab) await chrome.tabs.remove(tab.id);
};
refresh(); setInterval(refresh, 15000);
