# Integrations

Pluggable interactive features a streamer can enable for their channel — games
(bingo, wheel spin), engagement tools (rank), and standalone products that plug
in (the TCG). Each integration is a self-contained folder; the registry wires
them up and one generic router exposes them over HTTP.

## Layout

```
integrations/
  types.ts        Integration / IntegrationManifest / IntegrationContext contracts
  config.ts       per-streamer enabled+config storage (bot.tenants.settings.integrations.<id>)
  registry.ts     the list of all integrations (add yours here)
  router.ts       dispatches /api/integrations/<id>/* and the generic lifecycle
  <id>/index.ts   one folder per integration, default-exporting an Integration
```

## HTTP surface

| Route | Auth | Purpose |
|-------|------|---------|
| `GET /api/integrations/catalog` | public | list every manifest (for the catalog UI) |
| `GET /api/integrations/<id>` | streamer | `{ manifest, enabled, config }` |
| `POST /api/integrations/<id>/enable` | streamer | turn on for this streamer |
| `POST /api/integrations/<id>/disable` | streamer | turn off |
| `PATCH /api/integrations/<id>/config` | streamer | merge `{ config }` |
| `* /api/integrations/<id>/<action>` | streamer | module-specific (e.g. `POST .../spin`) |

The legacy importer routes (`/api/integrations/streamelements/*`,
`/api/integrations/nightbot/*`, `GET /api/integrations`) still live in
`../routes/integrations.ts`. The module router returns `null` for any path whose
first segment isn't a registered integration id, so the two coexist.

## Adding an integration

1. Create `integrations/<id>/index.ts`:

   ```ts
   import type { Integration } from '../types';
   import { json, error } from '../../lib/response';

   const myFeature: Integration = {
     manifest: {
       id: 'my-feature',
       name: 'My Feature',
       description: 'What it does, in one line.',
       icon: 'Sparkles',        // lucide icon name
       category: 'game',         // game | engagement | utility | product
       defaultConfig: { /* merged when first enabled */ },
     },
     async handle(ctx) {
       // ctx: { request, env, supabase, streamerId, segments, method, config, enabled }
       if (ctx.segments[0] === 'do-thing' && ctx.method === 'POST') {
         if (!ctx.enabled) return error('Not enabled', 403, ctx.request, ctx.env);
         return json({ ok: true }, ctx.request, ctx.env);
       }
       return null; // -> 404
     },
   };
   export default myFeature;
   ```

2. Register it in `registry.ts`.

That's it — enable/disable/config and the catalog work automatically. Config
lives in the `bot.tenants.settings` JSONB; graduate to a dedicated `bot.*` table
only when a module needs real persistence (e.g. live bingo game state).
