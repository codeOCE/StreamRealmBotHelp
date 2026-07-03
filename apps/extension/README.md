# CreatorCastle Cosmetics — Browser Extension

A 7TV-style browser extension that renders **CreatorCastle cosmetics** in Twitch
chat: custom **badges** next to usernames and animated **paints** (gradient
username styling). Cosmetics are defined per channel in the CreatorCastle
dashboard and earned by viewers either by a manual grant or by reaching a
loyalty level.

This is a **Manifest V3** extension for Chrome / Edge. No build step — it loads
as plain JS/CSS.

## How it works

```
Twitch chat (twitch.tv)
   │  content.js watches the chat DOM, reads each chatter's login
   ▼
background.js  ──GET──►  CreatorCastle Worker API
   (service worker)        /api/cosmetics/public/channel/:channel
                           → { cosmetics, users }   (public, no auth, CORS open)
```

- `content.js` resolves the channel from the URL, asks the background worker for
  that channel's cosmetics, then decorates every chat line (existing and new,
  via a `MutationObserver`).
- `background.js` fetches + caches the channel payload (2-minute TTL) so chat
  volume / tab switches don't hammer the API.
- Paints are CSS gradients clipped to the username text; the model matches
  `apps/web/lib/paint.ts` so the dashboard preview and chat look identical.

Cosmetics are **public** read-only data per channel, so the extension needs no
login in this version. Viewers and streamers manage what they wear on the
website (`/dashboard/cosmetics`).

## Install (load unpacked)

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and select this folder (`apps/extension`).
4. Open any Twitch channel — cosmetics appear in chat automatically.

## Configure

Click the extension icon to open the popup:

- **Show cosmetics** — master on/off toggle.
- **API server** — the CreatorCastle Worker origin.
  - Production: `https://api.creatorcastle.gg` (default)
  - Local dev: `http://localhost:8787`

## Local development

1. Run the Worker API (`apps/worker`): `npm run dev` → `http://localhost:8787`.
2. Apply the cosmetics migration to your Supabase project:
   `apps/worker/migrations/018_cosmetics.sql`.
3. Create badges/paints and grant them to a viewer at
   `http://localhost:3002/dashboard/cosmetics`.
4. In the extension popup, set **API server** to `http://localhost:8787`.
5. Open the channel on `twitch.tv` and watch the granted viewer's name.

> Channel resolution (login → CreatorCastle streamer) uses Twitch Helix on the
> Worker, so `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` must be set in the
> Worker's `.dev.vars`. As a fallback it also matches the streamer slug.

## Files

| File | Role |
|------|------|
| `manifest.json` | MV3 manifest (content script on `*.twitch.tv`, popup, host permissions) |
| `src/content.js` | Watches chat, applies badges + paints |
| `src/cosmetics.css` | Badge sizing + paint animation keyframes |
| `src/background.js` | Fetches + caches channel cosmetics from the Worker API |
| `src/popup.html` / `src/popup.js` | Settings UI (enable toggle, API server, status) |

## Works alongside 7TV / BTTV / FFZ

CreatorCastle cosmetics are designed to render **on top of** other chat
extensions:

- **Paints** are written as inline styles with `!important`. In the CSS cascade
  an important inline declaration outranks an important rule from a stylesheet
  (how 7TV applies paints), so ours win regardless of load order.
- The content script **re-asserts** our paint and badges whenever another
  extension repaints or re-renders a username (via a `MutationObserver`), so we
  aren't buried. The re-assert only writes when the DOM differs from ours, so it
  never loops.
- Our badges live in a managed wrapper kept as the **first** badge, leading any
  7TV/BTTV badges instead of being dropped.

## Notes / limits (v1)

- **Twitch only**, Chrome/Edge (MV3). YouTube/Kick and Firefox are out of scope
  for now.
- Matching is by **lowercased Twitch login** read from the chat DOM
  (`data-a-user`, falling back to the visible name).
- Twitch markup changes occasionally; selectors live at the top of `content.js`
  (`findNameEl`, `findChatContainer`) and are the first place to update if a
  Twitch redesign breaks rendering.
- No icon assets are bundled; add `icons/` + an `"icons"` block to
  `manifest.json` if you want a custom toolbar icon.
