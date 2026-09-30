"use client";

/**
 * The ⌘K dialog body: cmdk inside the design system's Dialog (focus trap, Escape, return focus,
 * bottom sheet on phones). Loaded lazily by `CommandMenu` the first time the menu opens, so cmdk and
 * the preset data stay out of the initial bundle.
 */
import { Command } from "cmdk";
import { ArrowRight, FileText, FlaskConical, Languages, Search, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/design/ui/dialog";
import type { Locale, RouteId } from "@/i18n/config";
import type { CommonMessages } from "@/i18n/messages/common";
import { cn } from "@/lib/utils";
import { addressCommand, languageCommand, pageCommands, scenarioCommands } from "./commands";

export type PaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: Locale;
  t: CommonMessages;
  pathname: string;
  currentRoute: RouteId | null;
};

const groupClass = cn(
  "px-1 pb-2 [&_[cmdk-group-heading]]:label-mono [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5",
  "[&_[cmdk-group-heading]]:text-fg-3",
);

function Item({ value, keywords, onSelect, icon, children, hint, disabled }: {
  value: string;
  keywords?: string[];
  onSelect?: () => void;
  icon: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <Command.Item
      value={value}
      keywords={keywords}
      onSelect={onSelect}
      disabled={disabled}
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-3 rounded-control px-2 py-2 text-body-sm text-fg-2 outline-none",
        "transition-colors duration-(--dur-instant) data-[selected=true]:bg-elev-3 data-[selected=true]:text-fg-1",
        "data-[disabled=true]:cursor-default data-[disabled=true]:text-fg-3",
        "[&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-fg-3",
      )}
    >
      {icon}
      <span className="min-w-0 flex-1">{children}</span>
      {hint}
    </Command.Item>
  );
}

export default function Palette({ open, onOpenChange, locale, t, pathname, currentRoute }: PaletteProps) {
  const c = t.command;
  const router = useRouter();
  const [query, setQuery] = useState("");
  const pages = useMemo(() => pageCommands(locale, t, currentRoute), [locale, t, currentRoute]);
  const scenarios = useMemo(() => scenarioCommands(locale, t), [locale, t]);
  const language = languageCommand(locale, t, pathname);
  const address = addressCommand(query, locale);

  const go = (target: string) => {
    onOpenChange(false);
    setQuery("");
    router.push(target);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setQuery("");
        onOpenChange(next);
      }}
    >
      <DialogContent closeLabel={t.nav.closeMenu} showClose={false} className="gap-0 p-0 sm:w-[min(36rem,calc(100vw-3rem))] sm:p-0">
        <DialogTitle className="sr-only">{c.title}</DialogTitle>
        <DialogDescription className="sr-only">{c.inputLabel}</DialogDescription>
        <Command label={c.inputLabel} loop className="flex min-h-0 flex-col">
          <div className="flex items-center gap-2 border-b border-line-2 px-4">
            <Search className="size-4 shrink-0 text-fg-3" aria-hidden />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder={c.placeholder}
              autoComplete="off"
              spellCheck={false}
              className="h-13 min-w-0 flex-1 bg-transparent text-body text-fg-1 outline-none placeholder:text-fg-3"
            />
          </div>
          <Command.List className="max-h-[min(60dvh,26rem)] overflow-y-auto overscroll-contain p-1">
            <Command.Empty className="px-3 py-8 text-center text-body-sm text-fg-3">{c.empty}</Command.Empty>

            {address && (
              <Command.Group heading={c.groups.address} forceMount className={groupClass}>
                {address.kind === "valid" ? (
                  <Item
                    value={`address ${address.address}`}
                    onSelect={() => go(address.href)}
                    icon={<Wallet aria-hidden />}
                    hint={<ArrowRight className="size-4 text-fg-3" aria-hidden />}
                  >
                    <span className="block">{c.checkPosition}</span>
                    <code className="block truncate font-mono text-caption text-fg-3">{address.address}</code>
                  </Item>
                ) : (
                  <Item value={`address-hint ${query}`} disabled icon={<Wallet aria-hidden />}>
                    {c.invalidAddress}
                  </Item>
                )}
              </Command.Group>
            )}

            <Command.Group heading={c.groups.pages} className={groupClass}>
              {pages.map((p) => (
                <Item
                  key={p.id}
                  value={`page ${p.id} ${p.label}`}
                  keywords={[p.href]}
                  onSelect={() => go(p.href)}
                  icon={<FileText aria-hidden />}
                  hint={p.current ? <span className="size-1.5 rounded-full bg-fg-3" aria-hidden /> : undefined}
                >
                  {p.label}
                </Item>
              ))}
            </Command.Group>

            <Command.Group heading={c.groups.scenarios} className={groupClass}>
              {scenarios.map((s) => (
                <Item
                  key={s.id}
                  value={`scenario ${s.id}`}
                  keywords={s.keywords}
                  onSelect={() => go(s.href)}
                  icon={<FlaskConical aria-hidden />}
                >
                  <span className="block font-mono text-fg-1">
                    <span lang="en">{s.symbol}</span> {s.shock}
                  </span>
                  <span className="block truncate text-caption text-fg-3">{s.detail}</span>
                </Item>
              ))}
            </Command.Group>

            <Command.Group heading={c.groups.language} className={groupClass}>
              <Item
                value={`language ${language.label} ${language.name}`}
                onSelect={() => go(language.href)}
                icon={<Languages aria-hidden />}
                hint={
                  <span lang={language.locale} className="text-caption text-fg-3">
                    {language.name}
                  </span>
                }
              >
                {language.label}
              </Item>
            </Command.Group>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
