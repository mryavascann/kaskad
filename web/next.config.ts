import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Several root layouts (one per locale, app/design): one 404 for unmatched URLs.
    globalNotFound: true,
  },
  // Pre-redesign Turkish URLs. Query strings carry over (/cuzdan?address=… keeps the address).
  redirects() {
    return [
      { source: "/cuzdan", destination: "/tr/cuzdan", permanent: true },
      // The signer choice now lives in the console's signer strip.
      { source: "/baglan", destination: "/tr/app", permanent: true },
    ];
  },
};

export default nextConfig;
