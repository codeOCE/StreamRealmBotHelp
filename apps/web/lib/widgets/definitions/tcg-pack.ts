// ============================================================================
// tcg-pack — the reference bundle widget on the widget standard.
// ----------------------------------------------------------------------------
// Ports the Castle TCG pack-rip animation (originally the standalone
// tcg.creatorcastle.gg /obs.html) into a self-contained widget bundle. Instead
// of polling its own backend it is driven entirely by the injected window API:
//   - onWidgetLoad  -> fieldData { packImage, cardBack, brandName, animationStyle, sound }
//   - onEventReceived('card-reveal') -> { cardImageUrl, userCardId, animationStyle }
// The host overlay owns the single realtime connection and fans events in.
// ============================================================================

import type { WidgetDefinition } from '../types';

const CSS = `
:root { --card-radius:14px; --card-border:#ffffff; --card-glow:#3faaff; --glow-strength:20px; --offset-y:0px; --backdrop-tint:transparent; }
body { background:var(--backdrop-tint); }
#stage { position:fixed; inset:0; display:flex; align-items:center; justify-content:center; perspective:1200px; pointer-events:none; }
#scale { transform-origin:center center; }
#obs-pack-offset { transform:translateY(var(--offset-y)); }
#pack-scene { position:relative; width:400px; height:560px; }
#pack-face { position:absolute; inset:0; z-index:8; transform:translateY(0); transition:opacity .6s ease; }
#pack-face img { width:100%; height:100%; object-fit:contain; object-position:center; display:block; }
#pack-face::before { content:''; position:absolute; inset:0; background:linear-gradient(105deg,transparent 40%,rgba(255,255,255,.1) 50%,transparent 60%); background-size:200% 200%; animation:shine-sweep 3s ease-in-out infinite; pointer-events:none; z-index:1; }
body.no-shine #pack-face::before { display:none; }
@keyframes shine-sweep { 0%{background-position:-200% 0;} 100%{background-position:200% 0;} }
#tear-cap { position:absolute; top:210px; left:0; right:0; height:10%; overflow:hidden; z-index:10; transition:transform .7s cubic-bezier(.5,0,.25,1), opacity .5s ease; }
#tear-cap img { position:absolute; top:0; left:0; width:100%; height:1000%; object-fit:contain; object-position:top center; }
.ripping #tear-cap { transform:translateY(-230%) rotate(-9deg) translateX(-10px); opacity:0; }
.ripping #pack-face { clip-path:inset(10% 0 0 0); }
#card-flipper { position:absolute; left:50%; top:50%; width:250px; height:350px; margin-left:-125px; margin-top:-175px; z-index:6; transform-style:preserve-3d; opacity:0; }
#card-flipper.glow { filter:drop-shadow(0 0 var(--glow-strength) var(--card-glow)); }
.card-face { position:absolute; inset:0; border-radius:var(--card-radius); backface-visibility:hidden; -webkit-backface-visibility:hidden; overflow:hidden; }
#card-back { background-image:url('https://cdn.codeoce.com/branding/default-card-back-light.png'); background-size:cover; background-position:center; border:2px solid var(--card-border); box-shadow:0 16px 48px rgba(0,0,0,.7); }
#card-front { transform:rotateY(180deg); }
#card-front img { width:100%; height:100%; object-fit:cover; display:block; }
@keyframes pack-shake { 0%,100%{transform:rotate(0) translateX(0);} 20%{transform:rotate(-2.5deg) translateX(-5px);} 40%{transform:rotate(2.5deg) translateX(5px);} 60%{transform:rotate(-2deg) translateX(-3px);} 80%{transform:rotate(2deg) translateX(3px);} }
.shaking { animation:pack-shake .11s linear infinite; }
.cosmic-glow { filter:drop-shadow(0 0 20px #3faaff) drop-shadow(0 0 40px #a855f7) !important; }
.brutalist-jitter { animation:brutalist-jitter .1s steps(2) infinite; }
@keyframes brutalist-jitter { 0%{transform:translate(5px,-5px) skew(5deg);} 50%{transform:translate(-5px,5px) skew(-5deg);} }
`;

const HTML = `
<div id="stage">
  <div id="scale">
    <div id="obs-pack-offset">
      <div id="pack-scene">
        <div id="pack-face"><img src="https://cdn.codeoce.com/branding/default-pack.png" alt="Pack"></div>
        <div id="tear-cap"><img src="https://cdn.codeoce.com/branding/default-pack.png" alt=""></div>
        <div id="card-flipper">
          <div class="card-face" id="card-back"></div>
          <div class="card-face" id="card-front"><img id="card-img" src="" alt=""></div>
        </div>
      </div>
    </div>
  </div>
</div>`;

const JS = `
let cfg = {};
let isAnimating = false;

// Scale the fixed 400x560 scene to fit the widget box, times the user size multiplier.
// The 0.85 factor reserves ~15% breathing room so the pack never fills edge-to-edge.
function fitScale() {
  const scaleEl = document.getElementById('scale');
  const fit = Math.min(window.innerWidth / 400, window.innerHeight / 560) * 0.85;
  const mult = Number(cfg.packScale) || 1;
  const s = (fit > 0 ? fit : 1) * mult;
  scaleEl.style.transform = 'scale(' + s + ')';
}
window.addEventListener('resize', fitScale);

function applyBranding(c) {
  const packImg = document.querySelector('#pack-face img');
  const tearImg = document.querySelector('#tear-cap img');
  if (c.packImage) { packImg.src = c.packImage; tearImg.src = c.packImage; }
  if (c.cardBack) {
    const back = document.getElementById('card-back');
    back.style.backgroundImage = 'url(' + c.cardBack + ')';
  }
  // Appearance — push field values into CSS variables the stylesheet reads.
  const root = document.documentElement.style;
  if (c.cardRadius != null) root.setProperty('--card-radius', c.cardRadius + 'px');
  if (c.cardBorderColor) root.setProperty('--card-border', c.cardBorderColor);
  if (c.cardGlow) root.setProperty('--card-glow', c.cardGlow);
  if (c.glowStrength != null) root.setProperty('--glow-strength', c.glowStrength + 'px');
  if (c.offsetY != null) root.setProperty('--offset-y', c.offsetY + 'px');
  if (c.backgroundTint) root.setProperty('--backdrop-tint', c.backgroundTint);
  document.body.classList.toggle('no-shine', c.showShine === false);
}

let polling = false;

// Resting closed-pack pose: visible and centered. Used in the editor preview so
// there's always something to see (and resize against), and between demo loops.
function showIdlePack() {
  const scene = document.getElementById('pack-scene');
  const packFace = document.getElementById('pack-face');
  const tearCap = document.getElementById('tear-cap');
  const flipper = document.getElementById('card-flipper');
  scene.style.transition = 'none'; scene.style.opacity = '1';
  scene.classList.remove('ripping','shaking','brutalist-jitter');
  packFace.style.transition = 'none'; packFace.style.opacity = '1'; packFace.style.transform = 'translateY(0)';
  tearCap.style.opacity = '0';
  flipper.style.opacity = '0';
}

window.addEventListener('onWidgetLoad', (e) => {
  cfg = e.detail.fieldData || {};
  fitScale();
  applyBranding(cfg);
  showIdlePack();
  // Editor preview: just show the resting closed pack — no animation loop since
  // there is no real card image and exposing the blank card back looks wrong.
  if (cfg.previewLoop) {
    return;
  }
  // Live: drive from the TCG queue API (same source the standalone OBS overlay uses).
  if (cfg.streamer && cfg.token && !polling) { polling = true; poll(); }
});

// Hub-driven reveals (test button / future EventSub-style push) also play.
window.addEventListener('onEventReceived', (e) => {
  if (e.detail.listener !== 'card-reveal') return;
  playReveal(e.detail.event || {});
});

const apiBase = () => (cfg.tcgHost || 'https://tcg.creatorcastle.gg').replace(/\\/$/, '');

async function poll() {
  if (isAnimating) { setTimeout(poll, 500); return; }
  try {
    const url = apiBase() + '/api/obs/next?streamer=' + encodeURIComponent(cfg.streamer) + '&token=' + encodeURIComponent(cfg.token);
    const res = await fetch(url);
    if (res.status === 403) { return; } // bad token — stop quietly
    const data = await res.json();
    if (data && data.cards) {
      const c = data.cards;
      // Consume immediately so it isn't replayed, then animate.
      fetch(apiBase() + '/api/obs/consume?streamer=' + encodeURIComponent(cfg.streamer) + '&token=' + encodeURIComponent(cfg.token) + '&id=' + encodeURIComponent(c.user_card_id), { method: 'POST' }).catch(() => {});
      await playReveal({ cardImageUrl: c.image_url || '', userCardId: c.user_card_id });
      poll();
    } else {
      setTimeout(poll, 2000);
    }
  } catch (err) {
    setTimeout(poll, 5000);
  }
}

const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function playReveal(card) {
  if (isAnimating) return;
  isAnimating = true;
  const scene = document.getElementById('pack-scene');
  const packFace = document.getElementById('pack-face');
  const tearCap = document.getElementById('tear-cap');
  const flipper = document.getElementById('card-flipper');
  const cardImg = document.getElementById('card-img');
  const animStyle = card.animationStyle || cfg.animationStyle || 'style1';

  const setFlip = (o, ry, ty, sc, tr) => {
    flipper.style.transition = tr; flipper.style.opacity = o;
    flipper.style.transform = 'rotateY(' + ry + 'deg) translateY(' + ty + 'px) scale(' + sc + ')';
  };

  // Optional sound
  if (cfg.sound) { try { new Audio(cfg.sound).play().catch(() => {}); } catch (e) {} }

  // Reset
  scene.style.opacity = '0'; scene.style.transition = 'none';
  scene.classList.remove('ripping','shaking','brutalist-jitter');
  flipper.classList.remove('cosmic-glow','glow');
  packFace.style.opacity = '1'; packFace.style.transform = 'translateY(210px)'; packFace.style.transition = '';
  tearCap.style.opacity = ''; tearCap.style.transform = '';
  flipper.style.zIndex = '6';
  setFlip(0, 0, 300, 1, 'none');
  await wait(50);

  // Pack fade-in
  scene.style.transition = 'opacity .5s ease'; scene.style.opacity = '1';
  await wait(700);

  // Card art
  if (card.cardImageUrl) { cardImg.src = card.cardImageUrl; } else { cardImg.removeAttribute('src'); }

  // Shake
  scene.classList.add('shaking'); await wait(950);
  scene.classList.remove('shaking'); await wait(200);

  // Rip
  scene.classList.add('ripping'); await wait(800);

  // Reveal — apply the user's glow to the revealed card (cosmic style adds its own)
  flipper.classList.add('glow');
  if (animStyle === 'style2') {
    setFlip(1, 360, -120, 1.2, 'transform .6s cubic-bezier(.175,.885,.32,1.275)'); await wait(600);
    flipper.style.zIndex = '20'; flipper.classList.add('cosmic-glow');
    setFlip(1, 720, 150, 1.5, 'transform 1s cubic-bezier(.34,1.56,.64,1)'); await wait(1000);
  } else if (animStyle === 'style3') {
    scene.classList.add('brutalist-jitter');
    setFlip(1, 0, -100, 1, 'transform .4s steps(4)'); await wait(400);
    flipper.style.zIndex = '20';
    setFlip(1, 180, 150, 1.3, 'transform .3s steps(3)'); await wait(300);
    scene.classList.remove('brutalist-jitter'); await wait(400);
  } else {
    setFlip(1, 0, -100, 1, 'transform .8s cubic-bezier(.25,1,.5,1)'); await wait(900);
    flipper.style.zIndex = '20';
    setFlip(1, 0, 150, 1.3, 'transform .7s cubic-bezier(.34,1.56,.64,1)'); await wait(800);
    setFlip(1, 180, 150, 1.3, 'transform 1.1s cubic-bezier(.4,0,.2,1)');
  }

  // Pack drops away
  packFace.style.transition = 'transform .4s cubic-bezier(.4,0,1,1), opacity .4s ease';
  packFace.style.transform = 'translateY(900px)'; packFace.style.opacity = '0';
  await wait(750);

  // Hold then fade
  await wait(Number(cfg.holdMs) || 5000);
  scene.style.transition = 'opacity .3s ease'; scene.style.opacity = '0';
  await wait(350);
  scene.classList.remove('ripping','brutalist-jitter');
  flipper.classList.remove('cosmic-glow','glow');
  isAnimating = false;
}
`;

const tcgPack: WidgetDefinition = {
    type: 'tcg-pack',
    name: 'TCG Pack',
    icon: 'Layers',
    defaultSize: { width: 400, height: 560 },
    listens: ['card-reveal'],
    renderMode: 'bundle',
    fields: {
        streamer: { type: 'text', label: 'TCG Streamer Slug', value: '', placeholder: 'your-channel' },
        token: { type: 'text', label: 'OBS Overlay Token', value: '', placeholder: 'from TCG dashboard' },
        tcgHost: { type: 'text', label: 'TCG Host', value: 'https://tcg.creatorcastle.gg' },
        animationStyle: {
            type: 'dropdown', label: 'Reveal Style',
            options: { style1: 'Standard', style2: 'Cosmic Burst', style3: 'Brutalist' },
            value: 'style1',
        },
        packImage: { type: 'image', label: 'Pack Art' },
        cardBack: { type: 'image', label: 'Card Back' },
        brandName: { type: 'text', label: 'Brand Name', value: '', placeholder: 'Your channel' },
        sound: { type: 'text', label: 'Open Sound URL', value: '', placeholder: 'https://…/open.wav' },
        holdMs: { type: 'number', label: 'Hold (ms)', value: 5000, min: 1000, max: 15000, step: 500 },

        // ── Appearance ──────────────────────────────────────────────
        packScale: { type: 'slider', label: 'Size', value: 1, min: 0.4, max: 2, step: 0.05 },
        offsetY: { type: 'slider', label: 'Vertical Offset', value: 0, min: -300, max: 300, step: 5 },
        cardRadius: { type: 'slider', label: 'Card Corner Radius', value: 14, min: 0, max: 40, step: 1 },
        cardGlow: { type: 'color', label: 'Card Glow', value: '#3faaff' },
        glowStrength: { type: 'slider', label: 'Glow Strength', value: 20, min: 0, max: 60, step: 2 },
        cardBorderColor: { type: 'color', label: 'Card Border', value: '#ffffff' },
        showShine: { type: 'checkbox', label: 'Pack Shine Sweep', value: true },
        backgroundTint: { type: 'text', label: 'Backdrop Tint', value: '', placeholder: 'transparent · rgba(0,0,0,.5)' },
        customCss: { type: 'textarea', label: 'Custom CSS (advanced)', value: '' },
    },
    bundle: { html: HTML, css: CSS, js: JS },
};

export default tcgPack;
