/**
 * Fonts for ImageResponse (Satori reads ttf/otf/woff, not the woff2 that next/font serves). The TTFs
 * in og/fonts are Geist and Geist Mono from the `geist` npm package (SIL OFL, see og/fonts/OFL.txt);
 * they cover latin-ext, so Turkish İ, ı, ş, ğ render correctly. Read once per server process.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

type OgFont = { name: string; data: Buffer; weight: 400 | 500; style: "normal" };

const FILES = [
  { name: "Geist", file: "Geist-Regular.ttf", weight: 400 },
  { name: "Geist", file: "Geist-Medium.ttf", weight: 500 },
  { name: "Geist Mono", file: "GeistMono-Regular.ttf", weight: 400 },
  { name: "Geist Mono", file: "GeistMono-Medium.ttf", weight: 500 },
] as const;

let loaded: Promise<OgFont[]> | undefined;

export function ogFonts(): Promise<OgFont[]> {
  loaded ??= Promise.all(
    FILES.map(async (f) => ({
      name: f.name,
      data: await readFile(join(process.cwd(), "og", "fonts", f.file)),
      weight: f.weight,
      style: "normal" as const,
    })),
  ).catch((error) => {
    loaded = undefined;
    throw error;
  });
  return loaded;
}
