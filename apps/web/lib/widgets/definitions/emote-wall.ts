// ============================================================================
// emote-wall — KappaGen-style emote rain (StreamElements "Emotes" / emote wall).
// Listens to chat `message` events and animates each Twitch emote in the message
// floating across the screen. Emote URLs are parsed server-side from the chat
// message fragments (see chat/pipeline.ts) and delivered on the `message` event.
// ============================================================================

import type { WidgetDefinition } from '../types';

const CSS = `
#box { position:fixed; inset:0; overflow:hidden; pointer-events:none; }
.emote { position:absolute; bottom:-80px; will-change:transform,opacity; filter:drop-shadow(0 2px 6px rgba(0,0,0,0.4)); }
.up   { animation-name:floatUp;   animation-timing-function:ease-out; animation-fill-mode:forwards; }
.down { animation-name:floatDown; animation-timing-function:linear;   animation-fill-mode:forwards; top:-80px; bottom:auto; }
.burst{ animation-name:burst;     animation-timing-function:cubic-bezier(.17,.67,.3,1.33); animation-fill-mode:forwards; }
@keyframes floatUp {
  0% { transform:translateY(0) translateX(0) scale(0.5); opacity:0; }
  12% { opacity:1; transform:translateY(-12vh) scale(1); }
  100% { transform:translateY(-110vh) translateX(var(--drift)) rotate(var(--spin)); opacity:0; }
}
@keyframes floatDown {
  0% { transform:translateY(0) translateX(0) scale(0.5); opacity:0; }
  12% { opacity:1; }
  100% { transform:translateY(110vh) translateX(var(--drift)) rotate(var(--spin)); opacity:0; }
}
@keyframes burst {
  0% { transform:translate(0,0) scale(0.2); opacity:0; }
  20% { opacity:1; }
  100% { transform:translate(var(--bx),var(--by)) scale(1); opacity:0; }
}
`;

const HTML = `<div id="box"></div>`;

const JS = `
var cfg={}, max=80, size=64, dur=5000, mode='up';
function rand(a,b){ return a + Math.random()*(b-a); }
function spawn(url){
  var box=document.getElementById('box');
  if(box.childElementCount>=max) return;
  var img=document.createElement('img');
  img.src=url; img.className='emote ' + mode;
  var sz = size * rand(0.7,1.3);
  img.style.width=sz+'px'; img.style.height=sz+'px';
  img.style.animationDuration=dur+'ms';
  img.style.setProperty('--drift', rand(-60,60)+'px');
  img.style.setProperty('--spin', rand(-40,40)+'deg');
  if(mode==='burst'){
    img.style.left='50%'; img.style.top='50%'; img.style.bottom='auto';
    img.style.setProperty('--bx', rand(-45,45)+'vw');
    img.style.setProperty('--by', rand(-40,40)+'vh');
  } else {
    img.style.left=rand(0,95)+'vw';
  }
  box.appendChild(img);
  setTimeout(function(){ img.remove(); }, dur+200);
}
window.addEventListener('onWidgetLoad', function(e){
  cfg=e.detail.fieldData||{};
  max=Math.max(10, Number(cfg.maxEmotes)||80);
  size=Math.max(16, Number(cfg.size)||64);
  dur=Math.max(1000, Number(cfg.duration)||5000);
  mode=cfg.mode||'up';
});
window.addEventListener('onEventReceived', function(e){
  if(e.detail.listener!=='message') return;
  var emotes=(e.detail.event && e.detail.event.emotes) || [];
  if(!emotes.length) return;
  emotes.slice(0,25).forEach(function(u,i){ setTimeout(function(){ spawn(u); }, i*70); });
});
`;

const emoteWall: WidgetDefinition = {
    type: 'emote-wall',
    name: 'Emote Wall',
    icon: 'Sparkles',
    defaultSize: { width: 600, height: 400 },
    listens: ['message'],
    renderMode: 'bundle',
    fields: {
        mode: {
            type: 'dropdown', label: 'Animation',
            options: { up: 'Float up', down: 'Rain down', burst: 'Burst from center' },
            value: 'up',
        },
        size: { type: 'slider', label: 'Emote Size', value: 64, min: 24, max: 160, step: 4 },
        duration: { type: 'slider', label: 'Travel Time (ms)', value: 5000, min: 1500, max: 12000, step: 250 },
        maxEmotes: { type: 'slider', label: 'Max On Screen', value: 80, min: 10, max: 200, step: 5 },
        customCss: { type: 'textarea', label: 'Custom CSS (advanced)', value: '' },
    },
    bundle: { html: HTML, css: CSS, js: JS },
};

export default emoteWall;
