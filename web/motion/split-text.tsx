/**
 * SplitText: a headline that rises word by word at first paint. Server component, pure CSS (no
 * hydration, so it is safe above the fold and does not delay LCP). Each word slides up out of its own
 * clipping mask with out-expo, `delay + index × stagger` ms after the page paints. Reduced motion:
 * words only fade.
 *
 * The real words and spaces stay in the DOM, so screen readers, search and copy/paste read the
 * sentence normally. Re-mount it (change its `key`) to replay.
 *
 * ```tsx
 * <SplitText as="h1" lines={["One transaction.", "Every liquidation wave."]} accent={[2]} className="text-display-xl" />
 * ```
 */
import { Fragment } from "react";
import { cn } from "@/lib/utils";
import styles from "./split-text.module.css";
import { stagger as staggerTokens } from "./tokens";

type SplitTextProps = {
  as?: "h1" | "h2" | "h3" | "p" | "span";
  /** The text, split on whitespace. Ignored when `lines` is given. */
  text?: string;
  /** Explicit lines, each rendered as a block. Word indices continue across lines. */
  lines?: readonly string[];
  /** Indices of words (0-based, across lines) set in the serif italic accent. */
  accent?: readonly number[];
  /** ms between words. Default `stagger.base` (40). */
  stagger?: number;
  /** ms before the first word. */
  delay?: number;
  className?: string;
  id?: string;
};

type Word = { text: string; index: number };

/** Splits lines into words and numbers them across lines. */
function splitWords(lines: readonly string[]): Word[][] {
  let index = 0;
  return lines.map((line) =>
    line
      .split(/\s+/)
      .filter(Boolean)
      .map((text) => ({ text, index: index++ })),
  );
}

const ACCENT = "font-serif font-normal italic tracking-[-0.02em] text-fg-2";

export function SplitText({ as: Tag = "h2", text = "", lines, accent = [], stagger = staggerTokens.base, delay = 0, className, id }: SplitTextProps) {
  const rows = splitWords(lines ?? [text]);
  const accented = new Set(accent);
  return (
    <Tag id={id} className={cn(styles.root, className)}>
      {rows.map((words, row) => {
        const content = words.map(({ text: word, index }, i) => (
          <Fragment key={index}>
            {i > 0 && " "}
            <span className={cn(styles.mask, accented.has(index) && ACCENT)}>
              <span className={styles.word} style={{ animationDelay: `${delay + index * stagger}ms` }}>
                {word}
              </span>
            </span>
          </Fragment>
        ));
        if (!lines) return <Fragment key={row}>{content}</Fragment>;
        return (
          <Fragment key={row}>
            {row > 0 && " "}
            <span className="block">{content}</span>
          </Fragment>
        );
      })}
    </Tag>
  );
}
