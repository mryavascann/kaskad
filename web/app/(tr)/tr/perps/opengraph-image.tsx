import { staticImage, OG_CONTENT_TYPE, OG_SIZE, ogAlt } from "@/og/images";

export const alt = ogAlt("perps", "tr");
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
// Static: title from og/copy.ts, no RPC.

export default function Image() {
  return staticImage("perps", "tr");
}
