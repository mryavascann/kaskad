"use client";

import { CircleHelp, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export function Help({ label, children }: { label: string; children: ReactNode }) {
  return <Popover><PopoverTrigger asChild><button className="help-button" aria-label={label}><CircleHelp size={15} /></button></PopoverTrigger><PopoverContent><strong>{label}</strong><div className="mt-2 text-sm text-muted">{children}</div></PopoverContent></Popover>;
}

export function Details({ title = "Nasıl hesaplandı?", children }: { title?: string; children: ReactNode }) {
  return <details className="disclosure"><summary>{title}<ChevronDown size={15} /></summary><div className="disclosure-body">{children}</div></details>;
}
