// ============================================================================
// goal-bar — a donation / follower / subscriber goal bar (StreamElements "Goal").
// ----------------------------------------------------------------------------
// Donations seed from the public tip-stats endpoint and bump live on `tip-latest`.
// Follower / subscriber goals start at a configured value and count up on
// `follower-latest` / `subscriber-latest` events during the stream.
// ============================================================================

import type { WidgetDefinition } from '../types';

const API_BASE = process.env.NEXT_PUBLIC_WORKER_URL || 'http://localhost:8787';

const CSS = `
:root { --bar:#3faaff; --track:rgba(255,255,255,0.08); --text:#ffffff; --font:'Inter',sans-serif; }
#wrap { font-family:var(--font); color:var(--text); width:100%; height:100%; display:flex; flex-direction:column; justify-content:center; gap:8px; padding:10px 4px; box-sizing:border-box; }
#title { font-weight:900; font-size:18px; letter-spacing:-0.01em; text-shadow:0 2px 8px rgba(0,0,0,0.5); }
#bar { position:relative; height:26px; border-radius:999px; background:var(--track); overflow:hidden; box-shadow:inset 0 1px 3px rgba(0,0,0,0.4); }
#fill { position:absolute; inset:0; width:0%; background:var(--bar); border-radius:999px; transition:width .8s cubic-bezier(.34,1.56,.64,1); box-shadow:0 0 16px var(--bar); }
#label { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:13px; text-shadow:0 1px 3px rgba(0,0,0,0.7); }
#sub { font-size:13px; font-weight:700; opacity:0.85; text-align:right; text-shadow:0 1px 4px rgba(0,0,0,0.5); }
`;

const HTML = `
<div id="wrap">
  <div id="title">Goal</div>
  <div id="bar"><div id="fill"></div><div id="label">0%</div></div>
  <div id="sub"></div>
</div>`;

const JS = `
var cfg={}, channel={}, cur='', target=0, current=0, type='donations';
function fmtNum(v){ return Math.round(v).toLocaleString(); }
function fmt(v){ return (type==='donations' && cur ? cur+' ' : '') + fmtNum(v); }
function render(){
  var pct = target>0 ? Math.min(100,(current/target)*100) : 0;
  document.getElementById('fill').style.width = pct.toFixed(1)+'%';
  document.getElementById('label').textContent = Math.round(pct)+'%';
  document.getElementById('sub').textContent = fmt(current)+' / '+fmt(target);
}
function applyStyle(c){
  var r=document.documentElement.style;
  if(c.barColor) r.setProperty('--bar',c.barColor);
  if(c.trackColor) r.setProperty('--track',c.trackColor);
  if(c.textColor) r.setProperty('--text',c.textColor);
  if(c.font) r.setProperty('--font',c.font);
  document.getElementById('title').textContent = c.title || 'Goal';
}
function apiBase(){ return (cfg.apiBase||'').replace(/\\/$/,''); }
function loadDonations(){
  if(!channel.slug || !apiBase()) return;
  fetch(apiBase()+'/api/overlays/public/'+encodeURIComponent(channel.slug)+'/tips')
    .then(function(r){return r.json();})
    .then(function(d){ cur=d.currency||''; current=(d.totalCents||0)/100; render(); })
    .catch(function(){});
}
window.addEventListener('onWidgetLoad', function(e){
  cfg=e.detail.fieldData||{}; channel=e.detail.channel||{};
  type=cfg.goalType||'donations';
  target=Number(cfg.target)||0;
  current=Number(cfg.startValue)||0;
  applyStyle(cfg); render();
  if(type==='donations'){ loadDonations(); setInterval(loadDonations,30000); }
});
window.addEventListener('onEventReceived', function(e){
  var l=e.detail.listener, ev=e.detail.event||{};
  if(type==='donations' && l==='tip-latest'){ current += Number(ev.amount)||0; render(); }
  else if(type==='followers' && l==='follower-latest'){ current += 1; render(); }
  else if(type==='subscribers' && l==='subscriber-latest'){ current += 1; render(); }
});
`;

const goalBar: WidgetDefinition = {
    type: 'goal-bar',
    name: 'Goal Bar',
    icon: 'Target',
    defaultSize: { width: 420, height: 110 },
    listens: ['tip-latest', 'follower-latest', 'subscriber-latest'],
    renderMode: 'bundle',
    fields: {
        goalType: {
            type: 'dropdown', label: 'Goal Type',
            options: { donations: 'Donations', followers: 'Followers', subscribers: 'Subscribers' },
            value: 'donations',
        },
        title: { type: 'text', label: 'Title', value: 'Donation Goal', placeholder: 'Donation Goal' },
        target: { type: 'number', label: 'Target', value: 100, min: 1, step: 1 },
        startValue: { type: 'number', label: 'Start value (followers/subs)', value: 0, min: 0, step: 1 },
        barColor: { type: 'color', label: 'Bar Color', value: '#3faaff' },
        trackColor: { type: 'color', label: 'Track Color', value: '#1a1a22' },
        textColor: { type: 'color', label: 'Text Color', value: '#ffffff' },
        font: { type: 'font', label: 'Font', value: "'Inter', sans-serif" },
        apiBase: { type: 'text', label: 'API Base (advanced)', value: API_BASE },
        customCss: { type: 'textarea', label: 'Custom CSS (advanced)', value: '' },
    },
    bundle: { html: HTML, css: CSS, js: JS },
};

export default goalBar;
