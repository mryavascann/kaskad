"use client";

import { Languages } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { switchLocalePath, type Locale } from "@/i18n/config";
import type { CommonMessages } from "@/i18n/messages/common";
import { cn } from "@/lib/utils";

/**
 * Link to the same page in the other language (a full page load: each locale has its own root layout).
 * Named by its content, "TR — Türkçe": the accessible name contains the visible "TR" (WCAG 2.5.3).
 */
export function LocaleSwitch({ locale, t, className }: { locale: Locale; t: CommonMessages["locale"]; className?: string }) {
  const pathname = usePathname() ?? "/";
  const target: Locale = locale === "en" ? "tr" : "en";
  return (
    <Link
      href={switchLocalePath(pathname, target)}
      // Each locale has its own root layout: the switch is a full page load, a prefetch would be wasted.
      prefetch={false}
      hrefLang={target}
      lang={target}
      className={cn(
        "label-mono inline-flex h-8 items-center gap-1.5 rounded-control border border-line-2 px-2.5 text-fg-2",
        "transition-colors duration-(--dur-fast) ease-out-quart hover:border-line-3 hover:text-fg-1",
        className,
      )}
    >
      <Languages className="size-3.5" aria-hidden />
      {t.switchToShort}{" "}
      <span className="sr-only">— {t.switchTo}</span>
    </Link>
  );
}
