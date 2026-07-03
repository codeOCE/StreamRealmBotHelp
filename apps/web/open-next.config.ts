import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Minimal config — no R2 incremental cache yet (add an r2IncrementalCache
// override + R2 bucket binding when ISR/SSG caching actually matters).
// ponytail: default cache is fine until traffic says otherwise.
export default defineCloudflareConfig();
