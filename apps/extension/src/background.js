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

async function fetchJson(base, path, channel) {
  const url = `${String(base).replace(/\/+$/, '')}${path}${encodeURIComponent(channel)}`;
  const res = await fetch(url, { method: 'GET', credentials: 'omit' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Cosmetics (badges/paints) and custom emotes come from two public routes;
// fetched together so the content script gets both in one message.
async function fetchChannel(apiBase, channel) {
  const base = String(apiBase || DEFAULTS.apiBase);
  const [cos, emo] = await Promise.all([
    fetchJson(base, '/api/cosmetics/public/channel/', channel),
    fetchJson(base, '/api/emotes/public/channel/', channel).catch(() => ({ emotes: {} })),
  ]);
  console.log('[CC bg] ok', channel, '→', Object.keys(cos.cosmetics || {}).length, 'cosmetics,', Object.keys(cos.users || {}).length, 'wearers,', Object.keys(emo.emotes || {}).length, 'emotes');
  return { cosmetics: cos.cosmetics || {}, users: cos.users || {}, emotes: emo.emotes || {}, channel: cos.channel || { login: channel } };
}

async function getCosmetics(channel, force) {
  const cfg = await getConfig();
  if (!cfg.enabled) return { cosmetics: {}, users: {}, emotes: {}, disabled: true };

  const key = String(channel || '').toLowerCase();
  if (!key) return { cosmetics: {}, users: {}, emotes: {} };

  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;

  try {
    const payload = await fetchChannel(cfg.apiBase, key);
    cache.set(key, { at: Date.now(), data: payload });
    return payload;
  } catch (e) {
    // On error, serve any stale cache; otherwise an empty payload.
    if (hit) return hit.data;
    return { cosmetics: {}, users: {}, emotes: {}, error: String(e && e.message ? e.message : e) };
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
