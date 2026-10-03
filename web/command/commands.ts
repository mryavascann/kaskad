/**
 * What the ⌘K menu offers, as plain data (no React), so the targets are unit-tested. Every href is
 * built from `ROUTES` / `href()`; scenario facts come from `presetFacts()` (deployment.json), and an
 * address is only offered after viem's `isAddress` accepts it.
 */
import { isAddress } from "viem";
import { href, LOCALES, ROUTES, switchLocalePath, type Locale, type RouteId } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import type { CommonMessages } from "@/i18n/messages/common";
import { presetFacts, visiblePresets, type PresetId } from "@/lib/chain/scenario";

export type PageCommand = { id: RouteId; label: string; href: string; current: boolean };

const PAGE_LABEL: Record<RouteId, (t: CommonMessages) => string> = {
  home: (t) => t.command.home,
  app: (t) => t.nav.console,
  wallet: (t) => t.nav.wallet,
  guard: (t) => t.nav.guard,
  replay: (t) => t.nav.replay,
  how: (t) => t.nav.how,
};

/** Every page in the current locale, in ROUTES order. */
export function pageCommands(locale: Locale, t: CommonMessages, currentRoute: RouteId | null = null): PageCommand[] {
  return (Object.keys(ROUTES) as RouteId[]).map((id) => ({ id, label: PAGE_LABEL[id](t), href: href(id, locale), current: id === currentRoute }));
}

export type ScenarioCommand = {
  id: PresetId;
  /** Token symbol (an English term: render with lang="en"). */
  symbol: string;
  /** "−3.0%" / "−%3,0" */
  shock: string;
  /** "Monad book · external oracle · real book · 57 positions" */
  detail: string;
  href: string;
  /** Extra words cmdk matches on. */
  keywords: string[];
};

/** Console presets → `/app?preset=<id>` (the console reads the `preset` search param). */
export function scenarioCommands(locale: Locale, t: CommonMessages, now: Date = new Date()): ScenarioCommand[] {
  const fmt = formatters(locale);
  const c = t.command;
  return visiblePresets().map(({ id }) => {
    const f = presetFacts(id, now);
    const shock = fmt.drop(f.shockPct / 100);
    const detail = [c.chain[f.chain], c.oracle[f.oracle], c.book[f.book], `${fmt.int(f.positions)} ${c.positions}`].join(" · ");
    return {
      id,
      symbol: f.symbol,
      shock,
      detail,
      href: `${href("app", locale)}?preset=${encodeURIComponent(id)}`,
      keywords: [f.symbol, shock, detail, id],
    };
  });
}

export type AddressCommand =
  | { kind: "valid"; address: `0x${string}`; href: string }
  | { kind: "incomplete" }
  | null;

/**
 * A pasted address → "Check this position" (`/wallet?address=…`). Something that starts like an
 * address but isn't one yet gets a hint; anything else gets nothing. Input never reaches the URL
 * unless viem accepts it as an address.
 */
export function addressCommand(query: string, locale: Locale): AddressCommand {
  const q = query.trim();
  if (isAddress(q, { strict: false })) {
    return { kind: "valid", address: q, href: `${href("wallet", locale)}?address=${encodeURIComponent(q)}` };
  }
  return /^0x[0-9a-f]*$/i.test(q) && q.length > 2 ? { kind: "incomplete" } : null;
}

export type LanguageCommand = { locale: Locale; label: string; name: string; href: string };

/** The same page in the other language. */
export function languageCommand(locale: Locale, t: CommonMessages, pathname: string): LanguageCommand {
  const target = LOCALES.find((l) => l !== locale) ?? locale;
  return { locale: target, label: t.command.switchLanguage, name: t.locale.switchTo, href: switchLocalePath(pathname, target) };
}
