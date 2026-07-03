/**
 * Pre-designed alert templates for the overlay Alert widget.
 *
 * Each preset is a complete {html, css, js} bundle applied to a widget's
 * config.htmlTemplate / customCss / customJs. Unlike StreamElements' mostly
 * single-event presets, every template here adapts to ALL event types at
 * runtime: the JS reads `window.alertData.type` and swaps the label, icon and
 * accent colour per event (follow / subscribe / cheer / raid / donation / gift).
 *
 * Placeholders {username} {message} {amount} {tier} are substituted by
 * buildAlertSrcDoc; window.alertData carries the same values to the JS.
 */

export interface AlertPreset {
  id: string;
  name: string;
  description: string;
  /** Swatch shown on the gallery card. */
  accent: string;
  html: string;
  css: string;
  js: string;
}

/** Shared per-event theme map every preset's JS uses (kept inline per preset so
 *  templates stay self-contained when copied into a widget). */
const EVENT_MAP_JS = `var D = window.alertData || {};
var MAP = {
  follow:    { label: 'New Follower',           icon: '❤', accent: '#a855f7' },
  subscribe: { label: 'New Subscriber',         icon: '★', accent: '#22d3ee' },
  cheer:     { label: (D.amount||0) + ' Bits',  icon: '◆', accent: '#fbbf24' },
  raid:      { label: 'Raid · ' + (D.amount||0), icon: '⚔', accent: '#fb7185' },
  donation:  { label: 'Tip · ' + (D.amount||0),  icon: '✦', accent: '#34d399' },
  gift:      { label: 'Gift Sub',               icon: '🎁', accent: '#f472b6' }
};
var M = MAP[D.type] || MAP.follow;
function set(sel, txt){ var e=document.querySelector(sel); if(e) e.textContent=txt; }
function hideIfEmpty(sel, val){ var e=document.querySelector(sel); if(e && !val) e.remove(); }`;

export const ALERT_PRESETS: AlertPreset[] = [
  // ── 1. Royal Decree (castle) ────────────────────────────────────────────
  {
    id: 'royal-decree',
    name: 'Royal Decree',
    description: 'Gilded banner with a wax seal — fit for the kingdom.',
    accent: '#d4af37',
    html: `<div id="alert" class="decree">
  <div class="seal" id="seal"></div>
  <div class="body">
    <div class="label" id="label"></div>
    <div class="name">{username}</div>
    <div class="msg">{message}</div>
  </div>
</div>`,
    css: `*{margin:0;padding:0;box-sizing:border-box}
body{background:transparent;font-family:'Georgia','Times New Roman',serif;width:100vw;height:100vh;display:flex;align-items:center;justify-content:center;overflow:hidden}
.decree{--c:#d4af37;display:flex;align-items:center;gap:18px;padding:20px 32px;background:linear-gradient(135deg,#1a1410,#0c0a08);border:2px solid var(--c);border-radius:6px;box-shadow:0 0 50px rgba(212,175,55,.25),inset 0 0 30px rgba(212,175,55,.06);position:relative;animation:decreeIn .7s cubic-bezier(.34,1.56,.64,1) both}
.decree:before,.decree:after{content:'';position:absolute;left:8px;right:8px;height:1px;background:var(--c);opacity:.5}
.decree:before{top:6px}.decree:after{bottom:6px}
.seal{width:58px;height:58px;border-radius:50%;background:radial-gradient(circle at 35% 30%,var(--c),#7a5c12);display:flex;align-items:center;justify-content:center;font-size:26px;color:#1a1410;box-shadow:0 4px 14px rgba(0,0,0,.5);animation:sealPulse 1.4s ease-in-out infinite}
.label{font-size:11px;font-weight:700;letter-spacing:.4em;text-transform:uppercase;color:var(--c)}
.name{font-size:30px;font-weight:700;color:#fff;letter-spacing:.01em;margin:2px 0;text-shadow:0 0 18px rgba(212,175,55,.4)}
.msg{font-size:13px;font-style:italic;color:rgba(255,255,255,.55);max-width:300px}
@keyframes decreeIn{from{opacity:0;transform:translateY(18px) scale(.92)}to{opacity:1;transform:none}}
@keyframes sealPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}`,
    js: `${EVENT_MAP_JS}
document.querySelector('.decree').style.setProperty('--c', M.accent);
set('#seal', M.icon);
set('#label', M.label);
hideIfEmpty('.msg', D.message);`,
  },

  // ── 2. Crystal (glassmorphism) ──────────────────────────────────────────
  {
    id: 'crystal',
    name: 'Crystal',
    description: 'Frosted glass with an adaptive accent glow. Clean and modern.',
    accent: '#22d3ee',
    html: `<div id="alert" class="crystal">
  <div class="ring"><span class="icon" id="icon"></span></div>
  <div class="label" id="label"></div>
  <div class="name">{username}</div>
  <div class="msg">{message}</div>
</div>`,
    css: `*{margin:0;padding:0;box-sizing:border-box}
body{background:transparent;font-family:'Inter','Segoe UI',sans-serif;width:100vw;height:100vh;display:flex;align-items:center;justify-content:center;overflow:hidden}
.crystal{--c:#22d3ee;display:flex;flex-direction:column;align-items:center;gap:8px;padding:26px 40px;border-radius:24px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.14);backdrop-filter:blur(22px);box-shadow:0 0 60px var(--c),inset 0 1px 0 rgba(255,255,255,.2);text-align:center;animation:cIn .6s cubic-bezier(.22,1,.36,1) both}
.ring{width:62px;height:62px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle,var(--c)22,transparent 70%);border:2px solid var(--c);box-shadow:0 0 24px var(--c);animation:float 2.4s ease-in-out infinite}
.icon{font-size:28px;color:#fff;filter:drop-shadow(0 0 8px var(--c))}
.label{font-size:11px;font-weight:800;letter-spacing:.28em;text-transform:uppercase;color:var(--c)}
.name{font-size:30px;font-weight:900;color:#fff;letter-spacing:-.02em}
.msg{font-size:13px;color:rgba(255,255,255,.55);font-style:italic;max-width:300px;line-height:1.5}
@keyframes cIn{from{opacity:0;transform:scale(.86) translateY(14px)}to{opacity:1;transform:none}}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}`,
    js: `${EVENT_MAP_JS}
document.querySelector('.crystal').style.setProperty('--c', M.accent);
set('#icon', M.icon);
set('#label', M.label);
hideIfEmpty('.msg', D.message);`,
  },

  // ── 3. Neon Pulse ───────────────────────────────────────────────────────
  {
    id: 'neon-pulse',
    name: 'Neon Pulse',
    description: 'Cyberpunk outline with a glitch entrance and animated scanline.',
    accent: '#f0f',
    html: `<div id="alert" class="neon">
  <div class="line"></div>
  <div class="row"><span class="icon" id="icon"></span><span class="label" id="label"></span></div>
  <div class="name" data-t="{username}">{username}</div>
  <div class="msg">{message}</div>
</div>`,
    css: `*{margin:0;padding:0;box-sizing:border-box}
body{background:transparent;font-family:'Inter',sans-serif;width:100vw;height:100vh;display:flex;align-items:center;justify-content:center;overflow:hidden}
.neon{--c:#f0f;position:relative;padding:22px 38px;background:rgba(6,4,12,.86);border:2px solid var(--c);border-radius:10px;box-shadow:0 0 8px var(--c),0 0 32px var(--c)55,inset 0 0 22px var(--c)22;text-align:center;animation:glitch .5s steps(2) both}
.line{position:absolute;top:0;left:0;right:0;height:2px;background:var(--c);box-shadow:0 0 12px var(--c);animation:scan 2.4s linear infinite}
.row{display:flex;align-items:center;justify-content:center;gap:8px}
.icon{font-size:20px;color:var(--c)}
.label{font-size:11px;font-weight:900;letter-spacing:.32em;text-transform:uppercase;color:var(--c);text-shadow:0 0 10px var(--c)}
.name{font-size:30px;font-weight:900;color:#fff;letter-spacing:.02em;margin-top:4px;text-shadow:0 0 14px var(--c)}
.msg{font-size:12px;color:rgba(255,255,255,.6);font-style:italic;margin-top:4px;max-width:300px}
@keyframes glitch{0%{opacity:0;transform:translate(-6px,0) skewX(8deg)}40%{opacity:1;transform:translate(4px,0) skewX(-6deg)}100%{opacity:1;transform:none}}
@keyframes scan{0%{top:0}100%{top:100%}}`,
    js: `${EVENT_MAP_JS}
document.querySelector('.neon').style.setProperty('--c', M.accent);
set('#icon', M.icon);
set('#label', M.label);
hideIfEmpty('.msg', D.message);`,
  },

  // ── 4. Minimal Line ─────────────────────────────────────────────────────
  {
    id: 'minimal-line',
    name: 'Minimal Line',
    description: 'Understated — a single accent bar and a clean slide-in.',
    accent: '#ffffff',
    html: `<div id="alert" class="min">
  <div class="bar"></div>
  <div class="text">
    <span class="label" id="label"></span>
    <span class="name">{username}</span>
    <span class="msg">{message}</span>
  </div>
</div>`,
    css: `*{margin:0;padding:0;box-sizing:border-box}
body{background:transparent;font-family:'Inter','Segoe UI',sans-serif;width:100vw;height:100vh;display:flex;align-items:center;justify-content:center;overflow:hidden}
.min{--c:#fff;display:flex;align-items:stretch;gap:16px;padding:6px 0;animation:slide .55s cubic-bezier(.22,1,.36,1) both}
.bar{width:4px;border-radius:4px;background:var(--c);box-shadow:0 0 16px var(--c);animation:grow .6s ease both}
.text{display:flex;flex-direction:column;justify-content:center;gap:2px}
.label{font-size:10px;font-weight:900;letter-spacing:.3em;text-transform:uppercase;color:var(--c);opacity:.8}
.name{font-size:28px;font-weight:800;color:#fff;letter-spacing:-.02em}
.msg{font-size:12px;color:rgba(255,255,255,.5);font-style:italic}
@keyframes slide{from{opacity:0;transform:translateX(-22px)}to{opacity:1;transform:none}}
@keyframes grow{from{transform:scaleY(0)}to{transform:scaleY(1)}}`,
    js: `${EVENT_MAP_JS}
document.querySelector('.min').style.setProperty('--c', M.accent);
set('#label', M.label);
hideIfEmpty('.msg', D.message);`,
  },

  // ── 5. Confetti Pop ─────────────────────────────────────────────────────
  {
    id: 'confetti-pop',
    name: 'Confetti Pop',
    description: 'Playful bounce with a burst of confetti. Big, friendly energy.',
    accent: '#fb7185',
    html: `<div id="alert" class="pop">
  <div class="burst" id="burst"></div>
  <div class="emoji" id="icon"></div>
  <div class="label" id="label"></div>
  <div class="name">{username}</div>
  <div class="msg">{message}</div>
</div>`,
    css: `*{margin:0;padding:0;box-sizing:border-box}
body{background:transparent;font-family:'Poppins','Inter',sans-serif;width:100vw;height:100vh;display:flex;align-items:center;justify-content:center;overflow:hidden}
.pop{--c:#fb7185;position:relative;display:flex;flex-direction:column;align-items:center;gap:6px;padding:24px 40px;border-radius:26px;background:rgba(10,8,14,.85);border:2px solid var(--c)55;text-align:center;animation:bounce .7s cubic-bezier(.18,1.5,.5,1) both}
.emoji{font-size:46px;animation:wob 1.2s ease-in-out infinite}
.label{font-size:12px;font-weight:900;letter-spacing:.2em;text-transform:uppercase;color:var(--c)}
.name{font-size:32px;font-weight:900;color:#fff;letter-spacing:-.02em}
.msg{font-size:13px;color:rgba(255,255,255,.55);font-style:italic;max-width:300px}
.burst i{position:absolute;top:40%;left:50%;width:8px;height:8px;border-radius:2px;opacity:0;animation:fly .9s ease-out forwards}
@keyframes bounce{from{opacity:0;transform:scale(.5)}to{opacity:1;transform:scale(1)}}
@keyframes wob{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(6deg)}}
@keyframes fly{0%{opacity:1;transform:translate(0,0) scale(1)}100%{opacity:0;transform:translate(var(--x),var(--y)) scale(.4)}}`,
    js: `${EVENT_MAP_JS}
document.querySelector('.pop').style.setProperty('--c', M.accent);
set('#icon', M.icon);
set('#label', M.label);
hideIfEmpty('.msg', D.message);
var colors=[M.accent,'#fbbf24','#22d3ee','#34d399','#fff'];
var b=document.getElementById('burst');
for(var i=0;i<18;i++){var s=document.createElement('i');var a=(Math.PI*2*i)/18;var r=70+Math.random()*50;s.style.setProperty('--x',(Math.cos(a)*r)+'px');s.style.setProperty('--y',(Math.sin(a)*r)+'px');s.style.background=colors[i%colors.length];s.style.animationDelay=(Math.random()*.12)+'s';b.appendChild(s);}`,
  },

  // ── 6. Retro Arcade ─────────────────────────────────────────────────────
  {
    id: 'retro-arcade',
    name: 'Retro Arcade',
    description: '8-bit pixel frame with a chunky press-start vibe.',
    accent: '#34d399',
    html: `<div id="alert" class="retro">
  <div class="px"></div>
  <div class="row"><span id="icon"></span><span class="label" id="label"></span></div>
  <div class="name">{username}</div>
  <div class="msg">{message}</div>
</div>`,
    css: `*{margin:0;padding:0;box-sizing:border-box}
body{background:transparent;font-family:'Press Start 2P','Courier New',monospace;width:100vw;height:100vh;display:flex;align-items:center;justify-content:center;overflow:hidden}
.retro{--c:#34d399;position:relative;padding:20px 30px;background:#0a0a12;border:4px solid var(--c);box-shadow:0 0 0 4px #0a0a12,0 0 0 8px var(--c),0 0 30px var(--c)66;text-align:center;image-rendering:pixelated;animation:blinkIn .4s steps(3) both}
.row{display:flex;align-items:center;justify-content:center;gap:10px;font-size:18px;color:var(--c)}
.label{font-size:9px;letter-spacing:.1em;color:var(--c);text-shadow:2px 2px 0 #0a0a12}
.name{font-size:18px;color:#fff;margin:10px 0 6px;text-shadow:2px 2px 0 var(--c)}
.msg{font-size:8px;color:rgba(255,255,255,.6);line-height:1.8;max-width:280px}
@keyframes blinkIn{0%{opacity:0}50%{opacity:1}60%{opacity:0}100%{opacity:1}}`,
    js: `${EVENT_MAP_JS}
document.querySelector('.retro').style.setProperty('--c', M.accent);
set('#icon', M.icon);
set('#label', M.label.toUpperCase());
hideIfEmpty('.msg', D.message);`,
  },
];
