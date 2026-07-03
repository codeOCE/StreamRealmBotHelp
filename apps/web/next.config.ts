import type { NextConfig } from "next";

// All backend traffic goes to the Cloudflare Worker (apps/worker). The old
// NestJS proxies were removed — the worker now owns auth + every /api route.
// localhost (not 127.0.0.1) so the OAuth redirect_uri the worker builds
// (`<origin>/auth/callback`) matches the URL registered in the Twitch console.
// Dev proxies to the local worker; prod build proxies to the deployed API worker.
// Override either with WORKER_DEV_URL. Evaluated at build time (rewrites()).
const workerDev =
  process.env.WORKER_DEV_URL ??
  (process.env.NODE_ENV === "production" ? "https://api.creatorcastle.gg" : "http://localhost:8787");

const nextConfig: NextConfig = {
  // Auth is a browser OAuth flow: it must be a real REDIRECT so the browser
  // navigates to the worker (then Twitch) top-level. A rewrite would proxy it
  // server-side, follow the worker's 302, and render Twitch's login page under
  // OUR origin (white page + cross-origin asset CORS failures).
  async redirects() {
    return [
      { source: "/auth/:path*", destination: `${workerDev}/auth/:path*`, permanent: false },
    ];
  },
  // /api is a same-origin proxy so session cookies stay first-party. These are
  // plain JSON responses (no cross-host redirects), so proxying is correct.
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${workerDev}/api/:path*` },
    ];
  },
};

export default nextConfig;
