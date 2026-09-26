"use client";

import * as Primitive from "@radix-ui/react-popover";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const Popover = Primitive.Root;
export const PopoverTrigger = Primitive.Trigger;
export function PopoverContent({ className, align = "center", sideOffset = 8, ...props }: ComponentProps<typeof Primitive.Content>) {
  return <Primitive.Portal><Primitive.Content align={align} sideOffset={sideOffset} className={cn("popover-content", className)} {...props} /></Primitive.Portal>;
}
