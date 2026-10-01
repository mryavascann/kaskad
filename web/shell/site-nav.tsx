import { soundToggleClass } from "@/audio/sound-toggle-styles";
import { SoundToggle } from "@/audio/sound-toggle";
import { CommandMenuButton } from "@/command/command-menu-button";
import { CommandMenuHost } from "@/command/command-menu";
import { ButtonArrow } from "@/design/ui/button-arrow";
import { ButtonLink } from "@/design/ui/button-link";
import { buttonStyles } from "@/design/ui/button-styles";
import { IntentLink as Link } from "@/design/ui/intent-link";
import { LiveIndicator } from "@/design/ui/status-dot";
import { Logo } from "@/design/ui/logo";
import { href, type Locale } from "@/i18n/config";
import type { CommonMessages } from "@/i18n/messages/common";
import { cn } from "@/lib/utils";
import { LiveBlockValue, LivePoller, NavLiveSwitch } from "./live-status";
import { LocaleSwitch } from "./locale-switch";
import { MobileMenu } from "./mobile-menu";
import { NavBarLinks } from "./nav-bar-links";

/**
 * The site header. A Server Component: the logo, the links, the live status and the buttons are
 * server HTML (classes merged here, so the islands ship without tailwind-merge), and only small
 * islands hydrate: the links' `aria-current`, the live block, ⌘K, sound, the language switch and the
 * phone menu button (its sheet loads on first use).
 */
export function SiteNav({ locale, t }: { locale: Locale; t: CommonMessages }) {
  const n = t.network;
  // The three states of the live block, rendered here; `NavLiveSwitch` shows one.
  const status = (live: "connecting" | "live" | "offline") => (
    <LiveIndicator
      className="hidden xl:inline-flex"
      label={live === "offline" ? n.offline : n.name}
      tone={live === "offline" ? "liq" : "safe"}
      pulse={live !== "offline"}
      valueLabel={n.block}
      value={live === "connecting" ? null : undefined}
      valueContent={live === "live" ? <LiveBlockValue locale={locale} /> : undefined}
      loadingLabel={n.connecting}
      title={n.liveLabel}
    />
  );

  return (
    <header className="sticky top-0 z-(--z-nav) border-b border-line bg-bg/85 backdrop-blur-md">
      <div className="page-shell flex h-(--nav-h) items-center gap-6 lg:gap-8">
        <Link href={href("home", locale)} className="-m-1 rounded-control p-1" aria-label={`${t.brand}, ${t.nav.label}`}>
          <Logo size={20} animated label={t.brand} />
        </Link>

        <nav aria-label={t.nav.label} className="hidden lg:block">
          <NavBarLinks locale={locale} labels={t.nav} />
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <NavLiveSwitch connecting={status("connecting")} live={status("live")} offline={status("offline")} />
          <LivePoller />
          <CommandMenuButton t={t.command} />
          <SoundToggle t={t.sound} className={soundToggleClass({ className: "hidden md:inline-flex" })} />
          <LocaleSwitch locale={locale} t={t.locale} />
          <ButtonLink href={href("app", locale)} variant="secondary" size="sm" className="hidden sm:inline-flex">
            {t.nav.cta}
            <ButtonArrow />
          </ButtonLink>
          <MobileMenu locale={locale} t={t} className={cn(buttonStyles({ variant: "ghost", size: "icon" }), "size-10 lg:hidden")} />
        </div>
      </div>
      <CommandMenuHost locale={locale} t={t} />
    </header>
  );
}
