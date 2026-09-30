import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Several root layouts (one per locale, app/design, the legacy group): one 404 for unmatched URLs.
    globalNotFound: true,
  },
};

export default nextConfig;
