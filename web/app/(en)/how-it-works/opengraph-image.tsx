import { staticImage, OG_CONTENT_TYPE, OG_SIZE, ogAlt } from "@/og/images";

export const alt = ogAlt("how", "en");
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
// Static: title and the snapshot block from deployment.json, no RPC.

export default function Image() {
  return staticImage("how", "en");
}
