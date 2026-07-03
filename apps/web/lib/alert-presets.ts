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
if (D.variant) M = Object.assign({}, M, { label: D.variant });
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

  // ── 7. Quest Scroll (parchment) ─────────────────────────────────────────
  {
    id: 'quest-scroll',
    name: 'Quest Scroll',
    description: 'A parchment scroll unrolls with the news — very kingdom-core.',
    accent: '#c9a227',
    html: `<div id="alert" class="scroll">
  <div class="parchment">
    <div class="label" id="label"></div>
    <div class="name">{username}</div>
    <div class="msg">{message}</div>
    <div class="rule"></div>
  </div>
</div>`,
    css: `*{margin:0;padding:0;box-sizing:border-box}
body{background:transparent;font-family:'Georgia','Times New Roman',serif;width:100vw;height:100vh;display:flex;align-items:center;justify-content:center;overflow:hidden}
.scroll{--c:#c9a227;filter:drop-shadow(0 14px 30px rgba(0,0,0,.55))}
.parchment{position:relative;padding:26px 46px;background:linear-gradient(175deg,#efe3c2,#dfcf9f 60%,#d3bf85);border-radius:8px;text-align:center;transform-origin:top center;animation:unroll .8s cubic-bezier(.22,1,.36,1) both;box-shadow:inset 0 0 40px rgba(120,90,20,.25)}
.parchment:before,.parchment:after{content:'';position:absolute;left:-8px;right:-8px;height:16px;background:linear-gradient(#8a6a26,#5f4718);border-radius:8px}
.parchment:before{top:-9px}.parchment:after{bottom:-9px}
.label{font-size:11px;font-weight:700;letter-spacing:.38em;text-transform:uppercase;color:#7a5c12}
.name{font-size:32px;font-weight:700;color:#2c1f08;margin:4px 0 2px;text-shadow:0 1px 0 rgba(255,255,255,.4)}
.msg{font-size:13px;font-style:italic;color:#5c4614;max-width:300px;margin:0 auto}
.rule{width:70%;height:1px;margin:12px auto 0;background:linear-gradient(90deg,transparent,#8a6a26,transparent)}
@keyframes unroll{from{opacity:0;transform:scaleY(.1) translateY(-30px)}60%{opacity:1;transform:scaleY(1.06)}to{opacity:1;transform:scaleY(1)}}`,
    js: `${EVENT_MAP_JS}
set('#label', M.label);
hideIfEmpty('.msg', D.message);`,
  },

  // ── 8. Holo Card (TCG) ──────────────────────────────────────────────────
  {
    id: 'holo-card',
    name: 'Holo Card',
    description: 'A holographic trading card flips in with a rainbow sheen sweep.',
    accent: '#8b5cf6',
    html: `<div id="alert" class="holo">
  <div class="sheen"></div>
  <div class="icon" id="icon"></div>
  <div class="label" id="label"></div>
  <div class="name">{username}</div>
  <div class="msg">{message}</div>
  <div class="foot">★ CREATOR CASTLE ★</div>
</div>`,
    css: `*{margin:0;padding:0;box-sizing:border-box}
body{background:transparent;font-family:'Inter','Segoe UI',sans-serif;width:100vw;height:100vh;display:flex;align-items:center;justify-content:center;overflow:hidden;perspective:900px}
.holo{--c:#8b5cf6;position:relative;width:250px;padding:26px 20px 16px;border-radius:16px;background:linear-gradient(160deg,#171226,#0b0817);border:2px solid var(--c);box-shadow:0 0 34px var(--c)66,inset 0 0 24px var(--c)22;text-align:center;overflow:hidden;animation:flip .9s cubic-bezier(.22,1,.36,1) both}
.sheen{position:absolute;inset:-60%;background:linear-gradient(115deg,transparent 35%,rgba(255,0,200,.18) 45%,rgba(0,255,240,.22) 50%,rgba(255,240,0,.16) 55%,transparent 65%);animation:sweep 2.6s ease-in-out infinite;pointer-events:none}
.icon{font-size:40px;filter:drop-shadow(0 0 12px var(--c))}
.label{font-size:10px;font-weight:900;letter-spacing:.3em;text-transform:uppercase;color:var(--c);margin-top:6px}
.name{font-size:26px;font-weight:900;color:#fff;letter-spacing:-.02em;margin:2px 0}
.msg{font-size:12px;color:rgba(255,255,255,.55);font-style:italic;line-height:1.4}
.foot{margin-top:12px;padding-top:8px;border-top:1px solid var(--c)44;font-size:8px;letter-spacing:.3em;color:rgba(255,255,255,.35)}
@keyframes flip{from{opacity:0;transform:rotateY(95deg) scale(.9)}to{opacity:1;transform:none}}
@keyframes sweep{0%,100%{transform:translateX(-30%) rotate(0deg)}50%{transform:translateX(30%) rotate(2deg)}}`,
    js: `${EVENT_MAP_JS}
document.querySelector('.holo').style.setProperty('--c', M.accent);
set('#icon', M.icon);
set('#label', M.label);
hideIfEmpty('.msg', D.message);`,
  },

  // ── 9. Terminal ─────────────────────────────────────────────────────────
  {
    id: 'terminal',
    name: 'Terminal',
    description: 'Green-on-black console with a typewriter effect and cursor.',
    accent: '#22c55e',
    html: `<div id="alert" class="term">
  <div class="bar"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span><span class="title">castle@stream:~</span></div>
  <div class="body"><span class="prompt">$</span> <span id="typed"></span><span class="cursor">▊</span></div>
</div>`,
    css: `*{margin:0;padding:0;box-sizing:border-box}
body{background:transparent;font-family:'JetBrains Mono','Fira Code','Courier New',monospace;width:100vw;height:100vh;display:flex;align-items:center;justify-content:center;overflow:hidden}
.term{--c:#22c55e;min-width:340px;max-width:460px;border-radius:10px;overflow:hidden;border:1px solid rgba(255,255,255,.12);box-shadow:0 18px 50px rgba(0,0,0,.6),0 0 30px var(--c)33;animation:tIn .4s ease both}
.bar{display:flex;align-items:center;gap:6px;padding:8px 12px;background:#1a1d23}
.dot{width:10px;height:10px;border-radius:50%}.dot.r{background:#ff5f57}.dot.y{background:#febc2e}.dot.g{background:#28c840}
.title{margin-left:8px;font-size:10px;color:rgba(255,255,255,.4)}
.body{padding:16px 16px 18px;background:#0b0e0c;font-size:14px;color:var(--c);text-shadow:0 0 8px var(--c)66;line-height:1.6;min-height:54px}
.prompt{opacity:.6}
.cursor{animation:blink .9s steps(1) infinite}
@keyframes blink{50%{opacity:0}}
@keyframes tIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}`,
    js: `${EVENT_MAP_JS}
document.querySelector('.term').style.setProperty('--c', M.accent);
var line = M.label.toLowerCase().replace(/[^a-z0-9]+/g,'_') + ' --user "' + D.username + '"';
if (D.message) line += ' -m "' + D.message + '"';
var el = document.getElementById('typed'); var i = 0;
(function type(){ if(i <= line.length){ el.textContent = line.slice(0, i++); setTimeout(type, 24); } })();`,
  },

  // ── 10. Vaporwave ───────────────────────────────────────────────────────
  {
    id: 'vaporwave',
    name: 'Vaporwave',
    description: 'Sunset gradient chrome with a retro grid floor. A E S T H E T I C.',
    accent: '#ff71ce',
    html: `<div id="alert" class="vapor">
  <div class="sun"></div>
  <div class="grid"></div>
  <div class="inner">
    <div class="label" id="label"></div>
    <div class="name">{username}</div>
    <div class="msg">{message}</div>
  </div>
</div>`,
    css: `*{margin:0;padding:0;box-sizing:border-box}
body{background:transparent;font-family:'Inter','Segoe UI',sans-serif;width:100vw;height:100vh;display:flex;align-items:center;justify-content:center;overflow:hidden}
.vapor{--c:#ff71ce;position:relative;width:360px;padding:30px 20px 26px;border-radius:18px;background:linear-gradient(180deg,#1a0b2e 0%,#2b1055 55%,#12071f 100%);border:1px solid rgba(255,113,206,.4);overflow:hidden;text-align:center;box-shadow:0 0 44px rgba(255,113,206,.3);animation:vIn .7s cubic-bezier(.22,1,.36,1) both}
.sun{position:absolute;left:50%;top:12px;transform:translateX(-50%);width:90px;height:90px;border-radius:50%;background:linear-gradient(180deg,#ffd319,#ff2975 70%);opacity:.5;filter:blur(2px)}
.grid{position:absolute;left:-20%;right:-20%;bottom:-10px;height:46%;background:repeating-linear-gradient(90deg,rgba(1,205,254,.35) 0 1px,transparent 1px 34px),repeating-linear-gradient(0deg,rgba(1,205,254,.35) 0 1px,transparent 1px 18px);transform:perspective(200px) rotateX(58deg);opacity:.7}
.inner{position:relative;z-index:2}
.label{font-size:11px;font-weight:900;letter-spacing:.5em;text-transform:uppercase;color:#01cdfe;text-shadow:0 0 12px #01cdfe}
.name{font-size:34px;font-weight:900;letter-spacing:.02em;margin:6px 0 2px;background:linear-gradient(180deg,#fff 20%,#ff71ce 50%,#01cdfe 80%);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 2px 6px rgba(255,113,206,.5))}
.msg{font-size:12px;color:rgba(255,255,255,.6);font-style:italic;max-width:280px;margin:0 auto}
@keyframes vIn{from{opacity:0;transform:scale(.9) translateY(16px)}to{opacity:1;transform:none}}`,
    js: `${EVENT_MAP_JS}
set('#label', M.label);
hideIfEmpty('.msg', D.message);`,
  },

  // ── 11. Cosmic ──────────────────────────────────────────────────────────
  {
    id: 'cosmic',
    name: 'Cosmic',
    description: 'Deep-space nebula glow with twinkling stars around the name.',
    accent: '#818cf8',
    html: `<div id="alert" class="cosmic">
  <div class="stars" id="stars"></div>
  <div class="icon" id="icon"></div>
  <div class="label" id="label"></div>
  <div class="name">{username}</div>
  <div class="msg">{message}</div>
</div>`,
    css: `*{margin:0;padding:0;box-sizing:border-box}
body{background:transparent;font-family:'Inter','Segoe UI',sans-serif;width:100vw;height:100vh;display:flex;align-items:center;justify-content:center;overflow:hidden}
.cosmic{--c:#818cf8;position:relative;display:flex;flex-direction:column;align-items:center;gap:6px;padding:30px 46px;border-radius:999px;background:radial-gradient(ellipse at 50% 40%,#2a2358 0%,#141031 55%,#0a0820 100%);border:1px solid var(--c)55;box-shadow:0 0 60px var(--c)44,inset 0 0 40px var(--c)22;text-align:center;overflow:hidden;animation:warpIn .8s cubic-bezier(.22,1,.36,1) both}
.icon{font-size:30px;filter:drop-shadow(0 0 14px var(--c));z-index:2}
.label{font-size:10px;font-weight:900;letter-spacing:.4em;text-transform:uppercase;color:var(--c);z-index:2}
.name{font-size:30px;font-weight:900;color:#fff;letter-spacing:-.02em;text-shadow:0 0 20px var(--c);z-index:2}
.msg{font-size:12px;color:rgba(255,255,255,.55);font-style:italic;max-width:280px;z-index:2}
.stars i{position:absolute;width:2px;height:2px;border-radius:50%;background:#fff;animation:tw 2s ease-in-out infinite}
@keyframes tw{0%,100%{opacity:.15;transform:scale(1)}50%{opacity:1;transform:scale(1.6)}}
@keyframes warpIn{from{opacity:0;transform:scale(.6);filter:blur(6px)}to{opacity:1;transform:scale(1);filter:blur(0)}}`,
    js: `${EVENT_MAP_JS}
document.querySelector('.cosmic').style.setProperty('--c', M.accent);
set('#icon', M.icon);
set('#label', M.label);
hideIfEmpty('.msg', D.message);
var st=document.getElementById('stars');
for(var i=0;i<26;i++){var s=document.createElement('i');s.style.left=(Math.random()*100)+'%';s.style.top=(Math.random()*100)+'%';s.style.animationDelay=(Math.random()*2)+'s';st.appendChild(s);}`,
  },

  // ── 12. Sticker Slap ────────────────────────────────────────────────────
  {
    id: 'sticker-slap',
    name: 'Sticker Slap',
    description: 'A chunky die-cut sticker slaps onto the screen at an angle.',
    accent: '#fbbf24',
    html: `<div id="alert" class="slap">
  <div class="sticker">
    <div class="row"><span class="icon" id="icon"></span><span class="label" id="label"></span></div>
    <div class="name">{username}</div>
    <div class="msg">{message}</div>
  </div>
</div>`,
    css: `*{margin:0;padding:0;box-sizing:border-box}
body{background:transparent;font-family:'Poppins','Inter',sans-serif;width:100vw;height:100vh;display:flex;align-items:center;justify-content:center;overflow:hidden}
.slap{--c:#fbbf24}
.sticker{position:relative;padding:20px 34px;background:var(--c);border:6px solid #fff;border-radius:22px;text-align:center;transform:rotate(-4deg);box-shadow:0 14px 0 rgba(0,0,0,.35),0 22px 44px rgba(0,0,0,.45);animation:slapIn .45s cubic-bezier(.18,1.6,.4,1) both}
.row{display:flex;align-items:center;justify-content:center;gap:8px}
.icon{font-size:20px}
.label{font-size:12px;font-weight:900;letter-spacing:.18em;text-transform:uppercase;color:rgba(0,0,0,.65)}
.name{font-size:34px;font-weight:900;color:#111;letter-spacing:-.03em;margin-top:2px;text-shadow:2px 2px 0 rgba(255,255,255,.5)}
.msg{font-size:12px;font-weight:700;color:rgba(0,0,0,.55);max-width:280px;margin-top:2px}
@keyframes slapIn{from{opacity:0;transform:rotate(10deg) scale(2.2)}to{opacity:1;transform:rotate(-4deg) scale(1)}}`,
    js: `${EVENT_MAP_JS}
document.querySelector('.slap').style.setProperty('--c', M.accent);
set('#icon', M.icon);
set('#label', M.label);
hideIfEmpty('.msg', D.message);`,
  },
];
