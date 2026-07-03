// ============================================================================
// tip-ticker — a horizontally scrolling marquee of recent donations
// (StreamElements "Donation ticker"). Seeds recent tips from the public
// tip-stats endpoint and prepends new ones live on `tip-latest`.
// ============================================================================

import type { WidgetDefinition } from '../types';

const API_BASE = process.env.NEXT_PUBLIC_WORKER_URL || 'http://localhost:8787';

const CSS = `
:root { --accent:#3faaff; --text:#ffffff; --font:'Inter',sans-serif; }
#wrap { font-family:var(--font); color:var(--text); width:100%; height:100%; display:flex; align-items:center; overflow:hidden; white-space:nowrap; }
#track { display:inline-flex; align-items:center; gap:48px; will-change:transform; padding-left:100%; }
.item { font-size:16px; font-weight:800; text-shadow:0 2px 8px rgba(0,0,0,0.6); }
.item .who { color:var(--accent); font-weight:900; }
.item .amt { margin-left:8px; opacity:0.9; }
`;

const HTML = `<div id="wrap"><div id="track"></div></div>`;

const JS = `
var cfg={}, channel={}, cur='', items=[], offset=0, speed=60, lastTs=0;
function esc(s){ return String(s||'').replace(/[<>&]/g,''); }
function fmt(cents){ return (cur?cur+' ':'') + (cents/100).toLocaleString(undefined,{maximumFractionDigits:2}); }
function itemHtml(e){
  return '<span class="item"><span class="who">'+esc(e.donorName||'Anonymous')+'</span><span class="amt">'+fmt(e.amountCents||0)+'</span>'+
    (e.message?'<span class="msg"> — '+esc(e.message)+'</span>':'')+'</span>';
}
function rebuild(){
  var track=document.getElementById('track');
  var prefix = cfg.prefix ? '<span class="item">'+esc(cfg.prefix)+'</span>' : '';
  track.innerHTML = prefix + items.map(itemHtml).join('');
  offset = track.parentElement.clientWidth; // start off the right edge
}
function applyStyle(c){
  var r=document.documentElement.style;
  if(c.accentColor) r.setProperty('--accent',c.accentColor);
  if(c.textColor) r.setProperty('--text',c.textColor);
  if(c.font) r.setProperty('--font',c.font);
}
function apiBase(){ return (cfg.apiBase||'').replace(/\\/$/,''); }
function tick(ts){
  var track=document.getElementById('track');
  if(!lastTs) lastTs=ts;
  var dt=(ts-lastTs)/1000; lastTs=ts;
  offset -= speed*dt;
  var w=track.scrollWidth;
  if(offset < -w) offset = track.parentElement.clientWidth;
  track.style.transform='translateX('+offset+'px)';
  requestAnimationFrame(tick);
}
function load(){
  if(!channel.slug || !apiBase()) return;
  fetch(apiBase()+'/api/overlays/public/'+encodeURIComponent(channel.slug)+'/tips')
    .then(function(r){return r.json();})
    .then(function(d){ cur=d.currency||''; items=(d.recent||[]).slice(0,20); rebuild(); })
    .catch(function(){});
}
window.addEventListener('onWidgetLoad', function(e){
  cfg=e.detail.fieldData||{}; channel=e.detail.channel||{};
  speed=Math.max(10, Number(cfg.speed)||60);
  applyStyle(cfg); load(); setInterval(load,120000);
  requestAnimationFrame(tick);
});
window.addEventListener('onEventReceived', function(e){
  if(e.detail.listener!=='tip-latest') return;
  var ev=e.detail.event||{};
  items.unshift({ donorName:ev.name, amountCents:Math.round((Number(ev.amount)||0)*100), message:ev.message });
  items=items.slice(0,20); rebuild();
});
`;

const tipTicker: WidgetDefinition = {
    type: 'tip-ticker',
    name: 'Donation Ticker',
    icon: 'Megaphone',
    defaultSize: { width: 900, height: 56 },
    listens: ['tip-latest'],
    renderMode: 'bundle',
    fields: {
        prefix: { type: 'text', label: 'Prefix', value: 'Recent tips:', placeholder: 'Recent tips:' },
        speed: { type: 'slider', label: 'Scroll Speed', value: 60, min: 20, max: 200, step: 5 },
        accentColor: { type: 'color', label: 'Accent Color', value: '#3faaff' },
        textColor: { type: 'color', label: 'Text Color', value: '#ffffff' },
        font: { type: 'font', label: 'Font', value: "'Inter', sans-serif" },
        apiBase: { type: 'text', label: 'API Base (advanced)', value: API_BASE },
        customCss: { type: 'textarea', label: 'Custom CSS (advanced)', value: '' },
    },
    bundle: { html: HTML, css: CSS, js: JS },
};

export default tipTicker;
