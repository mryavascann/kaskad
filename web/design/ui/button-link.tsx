import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { buttonStyles, type ButtonVariants } from "./button-styles";

type ButtonLinkProps = ComponentProps<typeof Link> & ButtonVariants;

/**
 * A next/link styled as a Button, without Radix Slot. Use it for navigation, especially in Server
 * Components: `<Button asChild><Link/></Button>` there can fail, because children that cross the
 * server → client boundary may arrive as lazy references that Slot cannot clone
 * ("Slot failed to slot onto its children"). Put `<ButtonArrow />` last for the hover nudge.
 */
export function ButtonLink({ variant, size, className, ...props }: ButtonLinkProps) {
  return <Link className={cn(buttonStyles({ variant, size }), className)} {...props} />;
}
