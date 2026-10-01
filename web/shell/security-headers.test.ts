import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";
import { contentSecurityPolicy, PERMISSIONS_POLICY, securityHeaders } from "./security-headers";

const directives = (csp: string) =>
  new Map(csp.split("; ").map((part) => {
    const [name, ...values] = part.split(" ");
    return [name, values] as const;
  }));

describe("contentSecurityPolicy", () => {
  const prod = directives(contentSecurityPolicy({ dev: false, production: true }));
  const dev = directives(contentSecurityPolicy({ dev: true, production: false }));

  it("locks every fetch to our own origin", () => {
    expect(prod.get("default-src")).toEqual(["'self'"]);
    expect(prod.get("connect-src")).toEqual(["'self'"]);
    expect(prod.get("font-src")).toEqual(["'self'"]);
    expect(prod.get("object-src")).toEqual(["'none'"]);
    expect(prod.get("base-uri")).toEqual(["'self'"]);
    expect(prod.get("form-action")).toEqual(["'self'"]);
  });

  it("forbids framing", () => {
    expect(prod.get("frame-ancestors")).toEqual(["'none'"]);
    expect(prod.get("frame-src")).toEqual(["'none'"]);
  });

  it("allows eval only in development", () => {
    expect(prod.get("script-src")).not.toContain("'unsafe-eval'");
    expect(dev.get("script-src")).toContain("'unsafe-eval'");
    // Static pages: Next's inline bootstrap needs 'unsafe-inline' (no nonces without dynamic rendering).
    expect(prod.get("script-src")).toEqual(["'self'", "'unsafe-inline'"]);
  });

  it("upgrades insecure requests only in production", () => {
    expect(prod.has("upgrade-insecure-requests")).toBe(true);
    expect(dev.has("upgrade-insecure-requests")).toBe(false);
  });

  it("adds the origin of a public RPC override, and ignores junk", () => {
    const withRpc = directives(contentSecurityPolicy({ dev: false, production: true, publicRpc: "http://127.0.0.1:8545/path" }));
    expect(withRpc.get("connect-src")).toEqual(["'self'", "http://127.0.0.1:8545"]);
    const junk = directives(contentSecurityPolicy({ dev: false, production: true, publicRpc: "javascript:alert(1)" }));
    expect(junk.get("connect-src")).toEqual(["'self'"]);
  });

  it("allows the Vercel toolbar on previews only", () => {
    const preview = contentSecurityPolicy({ dev: false, production: true, vercelPreview: true });
    expect(directives(preview).get("script-src")).toContain("https://vercel.live");
    expect(contentSecurityPolicy({ dev: false, production: true })).not.toContain("vercel.live");
  });
});

describe("securityHeaders", () => {
  it("sends the basic hardening headers", () => {
    const h = Object.fromEntries(securityHeaders({ dev: false, production: true }).map((x) => [x.key, x.value]));
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["Strict-Transport-Security"]).toMatch(/^max-age=\d+; includeSubDomains$/);
  });

  it("sends HSTS only in production", () => {
    expect(securityHeaders({ dev: true, production: false }).map((x) => x.key)).not.toContain("Strict-Transport-Security");
  });

  it("keeps passkeys (WebAuthn) and clipboard for our origin, disables hardware features", () => {
    expect(PERMISSIONS_POLICY).toContain("publickey-credentials-get=(self)");
    expect(PERMISSIONS_POLICY).toContain("publickey-credentials-create=(self)");
    expect(PERMISSIONS_POLICY).toContain("clipboard-write=(self)");
    expect(PERMISSIONS_POLICY).toContain("camera=()");
    expect(PERMISSIONS_POLICY).toContain("microphone=()");
  });
});

describe("next.config", () => {
  it("applies the headers to every path", async () => {
    const rules = await nextConfig.headers!();
    expect(rules).toHaveLength(1);
    expect(rules[0].source).toBe("/:path*");
    expect(rules[0].headers.map((h) => h.key)).toContain("Content-Security-Policy");
  });

  it("keeps the pre-redesign Turkish redirects", async () => {
    const redirects = await nextConfig.redirects!();
    expect(redirects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "/cuzdan", destination: "/tr/cuzdan", permanent: true }),
        expect.objectContaining({ source: "/baglan", destination: "/tr/app", permanent: true }),
      ]),
    );
  });
});
