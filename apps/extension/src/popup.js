/* CreatorCastle Cosmetics — popup settings. */

const DEFAULTS = { apiBase: 'https://api.creatorcastle.gg', enabled: true };

const enabledEl = document.getElementById('enabled');
const apiBaseEl = document.getElementById('apiBase');
const statusEl = document.getElementById('status');
const dashEl = document.getElementById('dash');

function dashUrl(apiBase) {
  // The dashboard lives on the web origin, not the API origin. Map the common
  // cases; otherwise fall back to the production site.
  if (/localhost|127\.0\.0\.1/.test(apiBase)) return 'http://localhost:3002/dashboard/cosmetics';
  return 'https://creatorcastle.gg/dashboard/cosmetics';
}

async function load() {
  const cfg = await chrome.storage.local.get(DEFAULTS);
  enabledEl.checked = cfg.enabled !== false;
  apiBaseEl.value = cfg.apiBase || DEFAULTS.apiBase;
  dashEl.href = dashUrl(apiBaseEl.value);
  refreshStatus();
}

async function refreshStatus() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !/twitch\.tv/.test(tab.url || '')) {
      statusEl.innerHTML = 'Open a Twitch channel to see cosmetics.';
      return;
    }
    const m = (tab.url || '').match(/twitch\.tv\/(?:popout\/|moderator\/|embed\/)?([a-zA-Z0-9_]+)/);
    const channel = m && m[1] ? m[1].toLowerCase() : null;
    if (!channel) { statusEl.innerHTML = 'Not on a channel page.'; return; }
    const resp = await chrome.runtime.sendMessage({ type: 'cc:getCosmetics', channel, force: true });
    const count = resp && resp.cosmetics ? Object.keys(resp.cosmetics).length : 0;
    const wearers = resp && resp.users ? Object.keys(resp.users).length : 0;
    if (resp && resp.error) statusEl.innerHTML = `Couldn't reach the API: <b>${resp.error}</b>`;
    else statusEl.innerHTML = `Channel <b>${channel}</b>: <b>${count}</b> cosmetic(s), <b>${wearers}</b> wearer(s).`;
  } catch (e) {
    statusEl.innerHTML = 'Status unavailable.';
  }
}

enabledEl.addEventListener('change', () => chrome.storage.local.set({ enabled: enabledEl.checked }).then(refreshStatus));
apiBaseEl.addEventListener('change', () => {
  const v = apiBaseEl.value.trim().replace(/\/+$/, '') || DEFAULTS.apiBase;
  apiBaseEl.value = v;
  dashEl.href = dashUrl(v);
  chrome.storage.local.set({ apiBase: v }).then(refreshStatus);
});

load();
