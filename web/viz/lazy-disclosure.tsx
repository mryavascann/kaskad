"use client";

import { useState, type ComponentProps } from "react";
import { Disclosure } from "@/design/ui/disclosure";

/**
 * A `Disclosure` whose content mounts the first time it is opened (and then stays mounted). Charts
 * fold hundreds of table cells into their data tables; keeping them out of the DOM until someone asks
 * for them keeps the page light (style and layout work scale with the node count).
 */
export function LazyDisclosure({ children, onToggle, ...props }: Omit<ComponentProps<typeof Disclosure>, "defaultOpen">) {
  const [opened, setOpened] = useState(false);
  return (
    <Disclosure
      {...props}
      onToggle={(e) => {
        if (e.currentTarget.open) setOpened(true);
        onToggle?.(e);
      }}
    >
      {opened ? children : null}
    </Disclosure>
  );
}
