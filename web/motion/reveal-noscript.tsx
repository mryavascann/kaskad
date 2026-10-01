/**
 * Makes `[data-reveal]` content (Reveal, StaggerItem) visible when JavaScript is off. Mount once, in
 * the root layout. A server component on purpose: importing it from `reveal.tsx` ("use client") would
 * put Reveal and Motion's `m.*` components in every page's initial JavaScript.
 */
export function RevealNoScript() {
  return (
    <noscript>
      <style>{"[data-reveal]{opacity:1!important;transform:none!important}"}</style>
    </noscript>
  );
}
