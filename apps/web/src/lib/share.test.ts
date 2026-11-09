import { describe, expect, it } from "vitest";
import type { ResolvedPhoto } from "./content";
import { sharePhotoUrl } from "./share";

const photo = (widths: number[]) =>
  ({ id: "01", width: 3000, height: 2000, alt: "x", tags: [], placeholder: "data:image/", exif: {}, widths }) as ResolvedPhoto;

describe("sharePhotoUrl", () => {
  it("uses the 1600 WebP when available", () => {
    expect(sharePhotoUrl("fog", photo([640, 1600, 2400]))).toBe("/photos/fog/01-1600.webp");
  });

  it("falls back to the largest width for a smaller photo", () => {
    expect(sharePhotoUrl("fog", photo([640, 1024, 1200]))).toBe("/photos/fog/01-1200.webp");
  });
});
