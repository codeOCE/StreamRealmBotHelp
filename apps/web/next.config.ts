import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/socket.io/:path*',
        destination: 'http://127.0.0.1:3001/socket.io/:path*',
      },
      {
        source: '/api/:path*',
        destination: 'http://127.0.0.1:3001/:path*',
      },
      {
        source: '/auth/:path*',
        destination: 'http://127.0.0.1:3001/auth/:path*',
      },
    ];
  },
};

export default nextConfig;
