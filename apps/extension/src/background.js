/**
 * CreatorCastle Cosmetics — background service worker.
 *
 * Owns the network: it fetches a channel's public cosmetics payload from the
 * CreatorCastle Worker API and caches it briefly so many chatters / tab
 * switches don't hammer the API. The content script (per Twitch tab) asks this
 * worker for cosmetics via runtime messaging.
 */

const DEFAULTS = { apiBase: 'https://api.creatorcastle.gg', enabled: true };
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

// channelLogin -> { at: epochMs, data }
const cache = new Map();

async function getConfig() {
  const stored = await chrome.storage.local.get(DEFAULTS);
  return { ...DEFAULTS, ...stored };
}

async function fetchChannelCosmetics(apiBase, channel) {
  const base = String(apiBase || DEFAULTS.apiBase).replace(/\/+$/, '');
  const url = `${base}/api/cosmetics/public/channel/${encodeURIComponent(channel)}`;
  console.log('[CC bg] fetching', url);
  const res = await fetch(url, { method: 'GET', credentials: 'omit' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  console.log('[CC bg] ok', channel, '→', Object.keys(json.cosmetics || {}).length, 'cosmetics,', Object.keys(json.users || {}).length, 'wearers');
  return json;
}

async function getCosmetics(channel, force) {
  const cfg = await getConfig();
  if (!cfg.enabled) return { cosmetics: {}, users: {}, disabled: true };

  const key = String(channel || '').toLowerCase();
  if (!key) return { cosmetics: {}, users: {} };

  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;

  try {
    const data = await fetchChannelCosmetics(cfg.apiBase, key);
    const payload = { cosmetics: data.cosmetics || {}, users: data.users || {}, channel: data.channel || { login: key } };
    cache.set(key, { at: Date.now(), data: payload });
    return payload;
  } catch (e) {
    // On error, serve any stale cache; otherwise an empty payload.
    if (hit) return hit.data;
    return { cosmetics: {}, users: {}, error: String(e && e.message ? e.message : e) };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== 'cc:getCosmetics') return;
  getCosmetics(msg.channel, !!msg.force).then(sendResponse);
  return true; // async response
});

// Clear the cache when settings change so a new API base / re-enable takes
// effect immediately on the next request.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.apiBase || changes.enabled)) cache.clear();
});
