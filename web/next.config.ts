import type { NextConfig } from "next";
import { securityHeaders } from "./shell/security-headers";

// Policy and reasoning live in shell/security-headers.ts (static CSP: pages stay statically rendered).
const headerEnv = {
  dev: process.env.NODE_ENV === "development",
  production: process.env.NODE_ENV === "production",
  vercelPreview: process.env.VERCEL_ENV === "preview",
  publicRpc: process.env.NEXT_PUBLIC_MONAD_TESTNET_RPC,
};

const nextConfig: NextConfig = {
  experimental: {
    // Several root layouts (one per locale, app/design): one 404 for unmatched URLs.
    globalNotFound: true,
  },
  headers() {
    return [{ source: "/:path*", headers: securityHeaders(headerEnv) }];
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
