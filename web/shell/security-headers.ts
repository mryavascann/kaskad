/**
 * Security headers for every response (wired in next.config.ts `headers()`). Pure, so the test can
 * check the policy without a server.
 *
 * Why a static CSP and not nonces: a nonce has to be fresh per request, which forces every page into
 * dynamic rendering (no static HTML, no ISR, no CDN cache; see the Next 16 CSP guide). Kaskad's pages
 * are static by design and render no user HTML, so the policy allows Next's inline bootstrap scripts
 * with 'unsafe-inline' and locks everything else to our own origin:
 *
 * - script-src: self + inline (Next's RSC payload / bootstrap). 'unsafe-eval' in dev only (React's
 *   dev stacks, Turbopack HMR); production never evals.
 * - style-src: self + inline (Motion, GSAP and NumberFlow write style attributes; next/font inlines
 *   @font-face).
 * - connect-src: self. The browser reads the chain through /api/rpc and funds through /api/fund
 *   (same origin); injected wallets talk to their own extension, not to the page. If
 *   NEXT_PUBLIC_MONAD_TESTNET_RPC points elsewhere (e.g. a local anvil), its origin is added.
 * - img-src: self, data: and blob: (OG images, canvas snapshots). font-src: self (next/font is
 *   self-hosted). worker-src: self + blob: (three.js / R3F loaders). WebGL needs no directive.
 * - frame-ancestors 'none' (+ X-Frame-Options DENY for old browsers), object-src 'none',
 *   base-uri 'self', form-action 'self'.
 * - Vercel preview deployments inject the feedback toolbar from vercel.live; it is allowed there only.
 *
 * Permissions-Policy turns off hardware and tracking features and keeps WebAuthn (Mera passkeys use
 * navigator.credentials with the PRF extension on this origin) and clipboard writes for ourselves.
 */

export type HeaderEnv = {
  /** `next dev`: allows eval for React's dev tooling. */
  dev: boolean;
  /** Served over HTTPS in production: HSTS and upgrade-insecure-requests. */
  production: boolean;
  /** A Vercel preview deployment (VERCEL_ENV=preview): allows the vercel.live toolbar. */
  vercelPreview?: boolean;
  /** NEXT_PUBLIC_MONAD_TESTNET_RPC, when set: the browser then reads the chain from there. */
  publicRpc?: string;
};

const VERCEL_LIVE = "https://vercel.live";

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" || u.protocol === "ws:" || u.protocol === "wss:" ? u.origin : null;
  } catch {
    return null;
  }
}

export function contentSecurityPolicy(env: HeaderEnv): string {
  const preview = env.vercelPreview ? [VERCEL_LIVE] : [];
  const rpc = originOf(env.publicRpc);
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...(env.dev ? ["'unsafe-eval'"] : []), ...preview],
    "style-src": ["'self'", "'unsafe-inline'", ...preview],
    "img-src": ["'self'", "data:", "blob:", ...(env.vercelPreview ? [VERCEL_LIVE, "https://vercel.com"] : [])],
    "font-src": ["'self'", ...(env.vercelPreview ? [VERCEL_LIVE, "https://assets.vercel.com"] : [])],
    "connect-src": ["'self'", ...(rpc ? [rpc] : []), ...(env.vercelPreview ? [VERCEL_LIVE, "wss://ws-us3.pusher.com"] : [])],
    "media-src": ["'self'"],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "frame-src": env.vercelPreview ? [VERCEL_LIVE] : ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  const parts = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`);
  if (env.production) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

/**
 * Features the site never uses are switched off. WebAuthn (passkeys) and clipboard-write stay
 * available to our own origin only. Every name here is one Chromium recognizes, so the header never
 * logs "Unrecognized feature".
 */
export const PERMISSIONS_POLICY = [
  "camera=()",
  "microphone=()",
  "geolocation=()",
  "payment=()",
  "usb=()",
  "serial=()",
  "hid=()",
  "midi=()",
  "magnetometer=()",
  "gyroscope=()",
  "accelerometer=()",
  "display-capture=()",
  "browsing-topics=()",
  "publickey-credentials-get=(self)",
  "publickey-credentials-create=(self)",
  "clipboard-write=(self)",
].join(", ");

export function securityHeaders(env: HeaderEnv): { key: string; value: string }[] {
  const headers = [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(env) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  ];
  if (env.production) headers.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" });
  return headers;
}
