// ============================================================================
// countdown — a countdown / "starting soon" timer (StreamElements "Countdown").
// Two modes: a fixed duration from when the overlay loads, or a target clock
// time. Purely client-side — no realtime or data needed.
// ============================================================================

import type { WidgetDefinition } from '../types';

const CSS = `
:root { --text:#ffffff; --accent:#3faaff; --font:'Inter',sans-serif; }
#wrap { font-family:var(--font); color:var(--text); width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; text-align:center; }
#label { font-size:16px; font-weight:800; letter-spacing:0.08em; text-transform:uppercase; opacity:0.8; text-shadow:0 2px 8px rgba(0,0,0,0.5); }
#time { font-size:64px; font-weight:900; line-height:1; letter-spacing:-0.02em; color:var(--accent); text-shadow:0 4px 20px rgba(0,0,0,0.5); font-variant-numeric:tabular-nums; }
`;

const HTML = `
<div id="wrap">
  <div id="label">Starting Soon</div>
  <div id="time">00:00</div>
</div>`;

const JS = `
var cfg={}, endAt=0, ended=false;
function pad(n){ return (n<10?'0':'')+n; }
function applyStyle(c){
  var r=document.documentElement.style;
  if(c.textColor) r.setProperty('--text',c.textColor);
  if(c.accentColor) r.setProperty('--accent',c.accentColor);
  if(c.font) r.setProperty('--font',c.font);
  document.getElementById('label').textContent = c.label || 'Starting Soon';
}
function compute(){
  if(cfg.mode==='target' && cfg.targetTime){
    var t=Date.parse(cfg.targetTime);
    return isNaN(t)? Date.now()+ (Number(cfg.minutes)||5)*60000 : t;
  }
  return Date.now() + (Number(cfg.minutes)||5)*60000;
}
function tick(){
  var ms=endAt-Date.now();
  var timeEl=document.getElementById('time');
  if(ms<=0){
    if(!ended){ ended=true; document.getElementById('label').textContent = cfg.endText || (cfg.label||'Starting Soon'); }
    timeEl.textContent = cfg.endText && cfg.hideZero ? '' : '00:00';
    return;
  }
  var s=Math.floor(ms/1000), h=Math.floor(s/3600), m=Math.floor((s%3600)/60), sec=s%60;
  timeEl.textContent = (h>0? h+':' : '') + pad(m)+':'+pad(sec);
}
window.addEventListener('onWidgetLoad', function(e){
  cfg=e.detail.fieldData||{};
  applyStyle(cfg);
  endAt=compute(); ended=false;
  tick(); setInterval(tick,250);
});
`;

const countdown: WidgetDefinition = {
    type: 'countdown',
    name: 'Countdown',
    icon: 'Timer',
    defaultSize: { width: 360, height: 160 },
    listens: [],
    renderMode: 'bundle',
    fields: {
        mode: {
            type: 'dropdown', label: 'Mode',
            options: { duration: 'Duration from load', target: 'Target time' },
            value: 'duration',
        },
        minutes: { type: 'number', label: 'Duration (minutes)', value: 5, min: 1, max: 600, step: 1 },
        targetTime: { type: 'text', label: 'Target time (ISO, target mode)', value: '', placeholder: '2026-01-01T20:00' },
        label: { type: 'text', label: 'Label', value: 'Starting Soon' },
        endText: { type: 'text', label: 'Text when finished', value: "We're Live!" },
        accentColor: { type: 'color', label: 'Number Color', value: '#3faaff' },
        textColor: { type: 'color', label: 'Label Color', value: '#ffffff' },
        font: { type: 'font', label: 'Font', value: "'Inter', sans-serif" },
        customCss: { type: 'textarea', label: 'Custom CSS (advanced)', value: '' },
    },
    bundle: { html: HTML, css: CSS, js: JS },
};

export default countdown;
