// ============================================================================
// Widget standard — runtime
// ----------------------------------------------------------------------------
// Builds the sandboxed iframe document for a widget and injects the standard
// window API. The host overlay holds ONE realtime connection and fans events
// into each widget iframe via postMessage; the shim below re-dispatches them as
// `onWidgetLoad` / `onEventReceived` DOM events and exposes `SE_API`.
//
// Mirrors the existing buildAlertSrcDoc pattern in lib/alert-renderer.ts.
// ============================================================================

import type { WidgetDefinition, FieldData, OverlayEvent, ChannelContext } from './types';

/** Default config for a freshly-added widget, derived from its field defaults. */
export function defaultFieldData(def: WidgetDefinition): FieldData {
    const out: FieldData = {};
    for (const [key, field] of Object.entries(def.fields)) {
        out[key] = (field as { value?: FieldData[string] }).value;
    }
    return out;
}

// Injected into every widget. Bridges parent postMessage <-> SE-style window API.
// Messages from host: { __sc: true, kind: 'load'|'event', ... }
// SE_API.store round-trips a request/response over postMessage to the host.
const API_SHIM = `(function () {
  var pending = {};
  var seq = 0;
  function post(msg) { parent.postMessage(Object.assign({ __scWidget: true }, msg), '*'); }

  window.SE_API = {
    store: {
      get: function (key) {
        return new Promise(function (resolve) {
          var id = 'r' + (++seq); pending[id] = resolve;
          post({ kind: 'store.get', id: id, key: key });
        });
      },
      set: function (key, value) { post({ kind: 'store.set', key: key, value: value }); }
    },
    counters: {
      get: function (name) {
        return new Promise(function (resolve) {
          var id = 'r' + (++seq); pending[id] = resolve;
          post({ kind: 'counter.get', id: id, name: name });
        });
      }
    }
  };

  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || !d.__scHost) return;
    if (d.kind === 'load') {
      window.dispatchEvent(new CustomEvent('onWidgetLoad', {
        detail: { fieldData: d.fieldData || {}, channel: d.channel || {} }
      }));
    } else if (d.kind === 'event') {
      window.dispatchEvent(new CustomEvent('onEventReceived', {
        detail: { listener: d.listener, event: d.event || {} }
      }));
    } else if (d.kind === 'store.result' && pending[d.id]) {
      pending[d.id](d.value); delete pending[d.id];
    }
  });

  // Signal readiness so the host re-sends load/queued events.
  post({ kind: 'ready' });
})();`;

/** Build the iframe srcDoc for a widget definition. fieldData/channel are also
 *  delivered live via postMessage, but seeding them avoids a first-frame flash. */
export function buildWidgetSrcDoc(
    def: WidgetDefinition,
    fieldData: FieldData,
    channel?: ChannelContext,
): string {
    const bundle = def.bundle ?? { html: '', css: '', js: '' };
    const seed = JSON.stringify({ fieldData, channel: channel ?? {} });
    // Generic power-user escape hatch: any bundle widget can expose a `customCss`
    // field and have it override the widget's own styles. Injected last so it wins.
    const customCss = typeof fieldData.customCss === 'string' ? fieldData.customCss : '';
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  html,body{margin:0;padding:0;width:100%;height:100%;background:transparent;overflow:hidden;}
  ${bundle.css}
</style>
<style id="sc-custom-css">${customCss}</style>
</head>
<body>
${bundle.html}
<script>window.__SC_SEED__ = ${seed};</script>
<script>${API_SHIM}</script>
<script>
  // Replay seeded load synchronously so widgets render before the first postMessage.
  (function(){ var s = window.__SC_SEED__ || {};
    window.dispatchEvent(new CustomEvent('onWidgetLoad', { detail: { fieldData: s.fieldData || {}, channel: s.channel || {} } }));
  })();
</script>
<script>${bundle.js}</script>
</body>
</html>`;
}

/** Map the realtime hub's raw (event, data) into the normalized OverlayEvent.
 *  Extend the switch as new event kinds are published into the hub. */
export function normalizeEvent(event: string, data: any): OverlayEvent | null {
    switch (event) {
        case 'card-reveal':
            return {
                listener: 'card-reveal',
                event: {
                    cardImageUrl: data?.image_url ?? data?.cardImageUrl,
                    userCardId: data?.user_card_id ?? data?.userCardId,
                    animationStyle: data?.animationStyle,
                    name: data?.username,
                },
            };
        case 'alert': {
            const t = data?.type ?? 'follow';
            const listener =
                t === 'follow' ? 'follower-latest' :
                t === 'subscribe' ? 'subscriber-latest' :
                t === 'cheer' ? 'cheer-latest' :
                t === 'raid' ? 'raid-latest' :
                t === 'donation' ? 'tip-latest' : `${t}-latest`;
            return { listener, event: { name: data?.username, amount: data?.amount, tier: data?.tier, message: data?.message } };
        }
        case 'chat':
            return { listener: 'message', event: { name: data?.username, message: data?.message, emotes: data?.emotes ?? [] } };
        case 'song.update':
            return { listener: 'song-update', event: { ...data } };
        default:
            return null;
    }
}
