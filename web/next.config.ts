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
    // `motion/react` re-exports all of framer-motion; load only the modules a file imports
    // (lucide-react is already on Next's default list).
    optimizePackageImports: ["motion", "framer-motion"],
    // Fewer render-blocking stylesheets: the default split gave every page 3 (globals, fonts, CSS
    // modules); the graph strategy with a high request cost merges them into 2, same bytes and order.
    // Measured on /how-it-works (Lighthouse mobile, 5 interleaved runs): LCP median 3.43 → 2.83 s.
    cssChunking: { type: "graph", requestCost: 200_000 },
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
