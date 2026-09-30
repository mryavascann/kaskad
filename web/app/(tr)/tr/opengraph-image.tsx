import { findingImage, OG_CONTENT_TYPE, OG_SIZE, ogAlt } from "@/og/images";

export const alt = ogAlt("home", "tr");
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
// Live numbers from the chain; re-read at most hourly (the RPC is paid).
export const revalidate = 3600;

export default function Image() {
  return findingImage("home", "tr");
}
