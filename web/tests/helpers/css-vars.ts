import { readFileSync } from "node:fs";

/** First declaration of every custom property in a CSS file (comments stripped). */
export function readCustomProperties(fileUrl: URL): Map<string, string> {
  const out = new Map<string, string>();
  const source = readFileSync(fileUrl, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const [, name, value] of source.matchAll(/--([a-z0-9-]+)\s*:\s*([^;{}]+);/gi)) {
    if (!out.has(name)) out.set(name, value.trim().replace(/\s+/g, " "));
  }
  return out;
}
