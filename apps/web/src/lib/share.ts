import type { ResolvedPhoto } from "./content";
import { photoUrl } from "./photo-url";

const SHARE_WIDTH = 1600;

export function sharePhotoUrl(event: string, photo: ResolvedPhoto): string {
  const width = photo.widths.includes(SHARE_WIDTH) ? SHARE_WIDTH : Math.max(...photo.widths);
  return photoUrl(event, photo.id, width, "webp");
}
