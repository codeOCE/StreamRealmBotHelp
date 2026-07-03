/**
 * CreatorCastle Cosmetics — Twitch content script.
 *
 * Watches the chat DOM and decorates usernames with CreatorCastle cosmetics:
 *   • paints — a gradient clipped to the username text (optionally animated)
 *   • badges — small images inserted before the username
 *
 * It resolves the current channel from the URL, asks the background worker for
 * that channel's public cosmetics, and applies them to every chat line (both
 * lines already on screen and new ones, via a MutationObserver). Twitch is a
 * single-page app, so we re-check the channel on a light interval.
 *
 * Precedence over 7TV / BTTV / FFZ:
 *   Those extensions also paint usernames and inject badges, and they may run
 *   after us and re-render the name node. To make CreatorCastle cosmetics win:
 *     1. Paints are written as INLINE styles with `!important`. In the CSS
 *        cascade an important inline declaration beats an important rule from a
 *        stylesheet (which is how 7TV applies paints), regardless of order.
 *     2. We also OBSERVE each wearer's line and re-assert our paint/badges if a
 *        third party overwrites or replaces them. The re-assert is idempotent
 *        (only writes when the current value differs from ours) so it can't loop.
 *     3. Our badges live in a managed wrapper kept as the FIRST badge, so they
 *        lead any 7TV badges instead of being pushed aside or dropped.
 */
(() => {
  'use strict';

  // Flip to false once everything works. Logs go to the Twitch tab's DevTools
  // console, prefixed with [CC].
  const DEBUG = true;
  const log = (...a) => DEBUG && console.log('[CC]', ...a);
  const warn = (...a) => DEBUG && console.warn('[CC]', ...a);

  const DONE_ATTR = 'data-cc-done';

  // First path segments that are NOT a channel.
  const NON_CHANNEL = new Set([
    '', 'directory', 'downloads', 'jobs', 'p', 'settings', 'search', 'subscriptions',
    'wallet', 'friends', 'inventory', 'drops', 'turbo', 'prime', 'store', 'login',
    'signup', 'following', 'videos', 'u', 'team', 'communities', 'collections',
  ]);

  /** Work out which channel (login) this tab is currently viewing. */
  function currentChannel() {
    const parts = location.pathname.split('/').filter(Boolean);
    if (parts.length === 0) return null;
    if (parts[0] === 'popout' || parts[0] === 'moderator' || parts[0] === 'embed') {
      return (parts[1] || '').toLowerCase() || null;
    }
    if (NON_CHANNEL.has(parts[0])) return null;
    return parts[0].toLowerCase();
  }

  // ── State ────────────────────────────────────────────────────────────────
  let channel = null;
  let cosmetics = {}; // id -> definition
  let users = {};     // login -> { badges:[ids], paint:id|null }
  let observer = null;
  let observedContainer = null;

  // Wearer lines we keep enforced against other extensions.
  // line element -> { login, nameEl, paint, badgeDefs, badgeWrap }
  const state = new WeakMap();
  const tracked = new Set();
  let enforceQueued = false;
  const seenLogins = new Set(); // DEBUG: chat logins that did NOT match

  // ── Cosmetic rendering ─────────────────────────────────────────────────────
  function gradientCss(paint) {
    const stops = (paint.stops && paint.stops.length ? paint.stops : [{ color: '#a855f7', at: 0 }, { color: '#22d3ee', at: 100 }])
      .slice()
      .sort((a, b) => a.at - b.at)
      .map((s) => `${s.color} ${Math.max(0, Math.min(100, s.at))}%`)
      .join(', ');
    if (paint.function === 'radial-gradient') return `radial-gradient(circle, ${stops})`;
    return `linear-gradient(${paint.angle != null ? paint.angle : 90}deg, ${stops})`;
  }

  /**
   * Apply (or re-apply) a paint to a username element. Returns the normalized
   * inline background-image value the browser stored, so callers can detect when
   * a third party later overwrites it.
   */
  function applyPaint(nameEl, paint) {
    if (!paint) return '';
    const animated = paint.animation && paint.animation !== 'none';
    nameEl.classList.add('cc-paint');
    if (animated) nameEl.classList.add('cc-paint--' + paint.animation);
    nameEl.style.setProperty('background-image', gradientCss(paint), 'important');
    nameEl.style.setProperty('background-size', animated ? '200% auto' : 'auto', 'important');
    nameEl.style.setProperty('-webkit-background-clip', 'text', 'important');
    nameEl.style.setProperty('background-clip', 'text', 'important');
    nameEl.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
    nameEl.style.setProperty('color', 'transparent', 'important');
    if (paint.shadow) nameEl.style.setProperty('filter', `drop-shadow(${paint.shadow})`, 'important');
    return nameEl.style.getPropertyValue('background-image');
  }

  function makeBadge(def) {
    const img = document.createElement('img');
    img.className = 'cc-badge';
    img.src = def.imageUrl || '';
    img.alt = def.name || '';
    img.title = `${def.name || ''}${def.rarity ? ' · ' + def.rarity : ''}`;
    img.dataset.ccRarity = def.rarity || 'common';
    return img;
  }

  function buildBadgeWrap(badgeDefs) {
    const wrap = document.createElement('span');
    wrap.className = 'cc-badges';
    for (const def of badgeDefs) {
      if (def && def.kind === 'badge' && def.imageUrl) wrap.appendChild(makeBadge(def));
    }
    return wrap.childNodes.length ? wrap : null;
  }

  /** Find the username element within a chat line. */
  function findNameEl(line) {
    return (
      line.querySelector('.chat-author__display-name') ||
      line.querySelector('[data-a-target="chat-message-username"]') ||
      line.querySelector('.chat-line__username')
    );
  }

  /** Where our badge wrapper should live (and lead). */
  function badgeContainer(line, nameEl) {
    return line.querySelector('.chat-line__username-container') || (nameEl && nameEl.parentNode) || null;
  }

  function loginFromName(nameEl, line) {
    const holder = nameEl.hasAttribute('data-a-user') ? nameEl : line.querySelector('[data-a-user]');
    const attr = holder && holder.getAttribute('data-a-user');
    if (attr) return attr.trim().toLowerCase();
    return (nameEl.textContent || '').trim().toLowerCase();
  }

  function decorate(line) {
    if (!line || line.hasAttribute(DONE_ATTR)) return;
    const nameEl = findNameEl(line);
    if (!nameEl) return;
    line.setAttribute(DONE_ATTR, '1');

    const login = loginFromName(nameEl, line);
    if (!login) return;
    const entry = users[login];
    if (!entry) {
      if (DEBUG) seenLogins.add(login);
      return;
    }
    log('match', login, entry);

    const paintDef = entry.paint && cosmetics[entry.paint] && cosmetics[entry.paint].kind === 'paint'
      ? (cosmetics[entry.paint].paint || {})
      : null;

    const badgeDefs = (entry.badges || []).map((id) => cosmetics[id]).filter((d) => d && d.kind === 'badge' && d.imageUrl);

    const s = { login, nameEl, paint: paintDef, paintGrad: '', badgeDefs, badgeWrap: null };

    if (paintDef) s.paintGrad = applyPaint(nameEl, paintDef);

    if (badgeDefs.length) {
      const wrap = buildBadgeWrap(badgeDefs);
      const container = badgeContainer(line, nameEl);
      if (wrap && container) {
        container.insertBefore(wrap, container.firstChild);
        s.badgeWrap = wrap;
      }
    }

    state.set(line, s);
    tracked.add(line);
  }

  /**
   * Re-assert our cosmetics on every tracked wearer line. Runs after any chat
   * mutation so a third-party extension (7TV/BTTV/FFZ) that repaints or
   * re-renders a name can't bury our styling. Idempotent: only writes when the
   * current DOM differs from what we set, so it cannot loop with its own writes.
   */
  function enforce() {
    enforceQueued = false;
    for (const line of tracked) {
      if (!line.isConnected) { tracked.delete(line); state.delete(line); continue; }
      const s = state.get(line);
      if (!s) { tracked.delete(line); continue; }

      // The name node may have been replaced by another extension — re-find it.
      let nameEl = s.nameEl;
      if (!nameEl || !nameEl.isConnected || !line.contains(nameEl)) {
        nameEl = findNameEl(line);
        s.nameEl = nameEl;
      }

      // Paint: re-apply if missing or overwritten by someone else. Gated on the
      // inline background-image round-trip (deterministic), so re-applying our
      // own value can't cause a feedback loop with the attributes observer.
      if (nameEl && s.paint) {
        const cur = nameEl.style.getPropertyValue('background-image');
        if (cur !== s.paintGrad) s.paintGrad = applyPaint(nameEl, s.paint);
      }

      // Badges: keep our wrapper present and leading.
      if (s.badgeDefs && s.badgeDefs.length) {
        const container = badgeContainer(line, nameEl);
        if (container) {
          if (!s.badgeWrap || !s.badgeWrap.isConnected || !container.contains(s.badgeWrap)) {
            s.badgeWrap = buildBadgeWrap(s.badgeDefs);
            if (s.badgeWrap) container.insertBefore(s.badgeWrap, container.firstChild);
          } else if (container.firstChild !== s.badgeWrap) {
            container.insertBefore(s.badgeWrap, container.firstChild); // move to front of badges
          }
        }
      }
    }
  }

  function scheduleEnforce() {
    if (enforceQueued || !tracked.size) return;
    enforceQueued = true;
    requestAnimationFrame(enforce);
  }

  function sweep(root) {
    (root || document).querySelectorAll('.chat-line__message:not([' + DONE_ATTR + '])').forEach(decorate);
  }

  function findChatContainer() {
    return (
      document.querySelector('.chat-scrollable-area__message-container') ||
      document.querySelector('[data-test-selector="chat-scrollable-area__message-container"]') ||
      document.querySelector('[role="log"]')
    );
  }

  let warnedNoContainer = false;
  function attachObserver() {
    const container = findChatContainer();
    if (!container) {
      if (DEBUG && !warnedNoContainer) { warn('chat container not found yet (selectors may be stale)'); warnedNoContainer = true; }
      return;
    }
    warnedNoContainer = false;
    if (container === observedContainer) return;
    if (observer) observer.disconnect();
    observedContainer = container;
    observer = new MutationObserver((mutations) => {
      let touched = false;
      for (const m of mutations) {
        if (m.type === 'attributes') { touched = true; continue; }
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.classList && node.classList.contains('chat-line__message')) decorate(node);
          else if (node.querySelectorAll) node.querySelectorAll('.chat-line__message').forEach(decorate);
          touched = true;
        }
      }
      // After any change, re-assert our cosmetics so 7TV/BTTV can't override them.
      if (touched) scheduleEnforce();
    });
    // attributes: catch a third party rewriting style/class on a painted name.
    observer.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
    sweep(container);
  }

  async function loadCosmetics(force) {
    if (!channel) return;
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'cc:getCosmetics', channel, force });
      if (!resp) { warn('no response from background worker'); return; }
      if (resp.error) warn('API error:', resp.error);
      if (resp.disabled) warn('extension is disabled in the popup');
      cosmetics = resp.cosmetics || {};
      users = resp.users || {};
      log(`loaded channel "${channel}":`, Object.keys(cosmetics).length, 'cosmetic(s),', Object.keys(users).length, 'wearer(s)');
      if (DEBUG) log('wearer logins:', Object.keys(users).slice(0, 20));
      // New data → allow every line to be re-evaluated.
      tracked.clear();
      document.querySelectorAll('.chat-line__message[' + DONE_ATTR + ']').forEach((l) => l.removeAttribute(DONE_ATTR));
      sweep(document);
    } catch (_e) {
      /* background worker asleep / not ready — retry on next tick */
    }
  }

  // ── SPA + lifecycle loop ───────────────────────────────────────────────────
  function tick() {
    const ch = currentChannel();
    if (ch !== channel) {
      channel = ch;
      cosmetics = {};
      users = {};
      tracked.clear();
      if (channel) loadCosmetics(true);
    }
    if (channel) attachObserver();
    scheduleEnforce();
  }

  setInterval(tick, 1500);
  setInterval(() => loadCosmetics(true), 2 * 60 * 1000);
  tick();

  // Console helpers for debugging: run __cc.dump() in the Twitch tab console.
  if (DEBUG) {
    window.__cc = {
      get channel() { return channel; },
      get cosmetics() { return cosmetics; },
      get users() { return users; },
      get unmatchedLogins() { return [...seenLogins]; },
      reload: () => loadCosmetics(true),
      dump() {
        console.log('[CC] channel:', channel);
        console.log('[CC] cosmetics:', cosmetics);
        console.log('[CC] wearers:', users);
        console.log('[CC] unmatched chat logins:', [...seenLogins]);
      },
    };
  }
})();
