// ============================================================================
// tip-leaderboard — top supporters by completed tip total (StreamElements
// "Top Donators"). Seeds from the public tip-stats endpoint and refreshes on
// each `tip-latest` event.
// ============================================================================

import type { WidgetDefinition } from '../types';

const API_BASE = process.env.NEXT_PUBLIC_WORKER_URL || 'http://localhost:8787';

const CSS = `
:root { --accent:#3faaff; --text:#ffffff; --font:'Inter',sans-serif; }
#wrap { font-family:var(--font); color:var(--text); width:100%; height:100%; padding:12px; box-sizing:border-box; display:flex; flex-direction:column; gap:8px; }
#title { font-weight:900; font-size:16px; letter-spacing:0.04em; text-transform:uppercase; color:var(--accent); text-shadow:0 2px 8px rgba(0,0,0,0.5); }
#rows { display:flex; flex-direction:column; gap:6px; overflow:hidden; }
.row { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:6px 12px; border-radius:12px; background:rgba(255,255,255,0.05); backdrop-filter:blur(8px); }
.row .who { font-weight:800; font-size:14px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.row .rank { color:var(--accent); margin-right:8px; }
.row .amt { font-weight:900; font-size:14px; opacity:0.9; white-space:nowrap; }
.empty { opacity:0.5; font-size:13px; font-weight:700; padding:8px 12px; }
`;

const HTML = `
<div id="wrap">
  <div id="title">Top Supporters</div>
  <div id="rows"><div class="empty">No supporters yet</div></div>
</div>`;

const JS = `
var cfg={}, channel={}, cur='', count=5, timer=null;
function fmt(cents){ return (cur?cur+' ':'') + (cents/100).toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:2}); }
function applyStyle(c){
  var r=document.documentElement.style;
  if(c.accentColor) r.setProperty('--accent',c.accentColor);
  if(c.textColor) r.setProperty('--text',c.textColor);
  if(c.font) r.setProperty('--font',c.font);
  document.getElementById('title').textContent = c.title || 'Top Supporters';
}
function apiBase(){ return (cfg.apiBase||'').replace(/\\/$/,''); }
function render(list){
  var rows=document.getElementById('rows');
  if(!list || !list.length){ rows.innerHTML='<div class="empty">No supporters yet</div>'; return; }
  rows.innerHTML='';
  list.slice(0,count).forEach(function(e,i){
    var div=document.createElement('div'); div.className='row';
    var who=document.createElement('div'); who.className='who';
    who.innerHTML='<span class="rank">#'+(i+1)+'</span>'+ (e.donorName||'Anonymous').replace(/[<>&]/g,'');
    var amt=document.createElement('div'); amt.className='amt'; amt.textContent=fmt(e.totalCents||0);
    div.appendChild(who); div.appendChild(amt); rows.appendChild(div);
  });
}
function load(){
  if(!channel.slug || !apiBase()) return;
  fetch(apiBase()+'/api/overlays/public/'+encodeURIComponent(channel.slug)+'/tips')
    .then(function(r){return r.json();})
    .then(function(d){ cur=d.currency||''; render(d.leaderboard||[]); })
    .catch(function(){});
}
window.addEventListener('onWidgetLoad', function(e){
  cfg=e.detail.fieldData||{}; channel=e.detail.channel||{};
  count=Math.max(1, Number(cfg.count)||5);
  applyStyle(cfg); load(); setInterval(load,60000);
});
window.addEventListener('onEventReceived', function(e){
  if(e.detail.listener!=='tip-latest') return;
  // Debounce so a burst of tips triggers one refresh.
  if(timer) clearTimeout(timer);
  timer=setTimeout(load,1500);
});
`;

const tipLeaderboard: WidgetDefinition = {
    type: 'tip-leaderboard',
    name: 'Top Supporters',
    icon: 'Trophy',
    defaultSize: { width: 340, height: 300 },
    listens: ['tip-latest'],
    renderMode: 'bundle',
    fields: {
        title: { type: 'text', label: 'Title', value: 'Top Supporters' },
        count: { type: 'number', label: 'How many to show', value: 5, min: 1, max: 10, step: 1 },
        accentColor: { type: 'color', label: 'Accent Color', value: '#3faaff' },
        textColor: { type: 'color', label: 'Text Color', value: '#ffffff' },
        font: { type: 'font', label: 'Font', value: "'Inter', sans-serif" },
        apiBase: { type: 'text', label: 'API Base (advanced)', value: API_BASE },
        customCss: { type: 'textarea', label: 'Custom CSS (advanced)', value: '' },
    },
    bundle: { html: HTML, css: CSS, js: JS },
};

export default tipLeaderboard;
