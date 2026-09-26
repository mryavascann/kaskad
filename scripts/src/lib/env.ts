import { fileURLToPath } from "node:url";
import path from "node:path";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
export const SCRIPTS_DIR = path.resolve(here, "..", "..");
export const DATA_DIR = path.join(SCRIPTS_DIR, "data");
dotenv.config({ path: path.resolve(SCRIPTS_DIR, "..", ".env"), quiet: true });

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") throw new Error(`Missing env var ${name} (expected in repo-root .env)`);
  return v.trim();
}
