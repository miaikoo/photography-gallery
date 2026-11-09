import { join } from "node:path";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { closeExif, mapExif, readExif } from "./exif";
import { tempDir, writeTestTags } from "./test-utils";

afterAll(closeExif);

const tags = {
  DateTimeOriginal: "2026:08:17 23:58:00",
  Make: "FUJIFILM", Model: "X-T5", LensModel: "XF23mmF1.4 R LM WR",
  FocalLength: "23.0 mm", FNumber: 5.6, ExposureTime: "1/250", ISO: 200,
};

describe("mapExif", () => {
  it("maps each allowed field", () =>
    expect(mapExif(tags)).toEqual({
      date: "2026-08-17", camera: "Fujifilm X-T5", lens: "XF23mmF1.4 R LM WR",
      focalLength: "23mm", aperture: "f/5.6", shutter: "1/250s", iso: 200,
    }));
  it("doesn't repeat a brand already in the model", () =>
    expect(mapExif({ Make: "Canon", Model: "Canon EOS R6" }).camera).toBe("Canon EOS R6"));
  it("keeps the date the camera wrote, near midnight", () =>
    expect(mapExif({ DateTimeOriginal: "2026:08:17 23:58:00+07:00" }).date).toBe("2026-08-17"));
  it("treats an unset camera date as no date", () =>
    expect(mapExif({ DateTimeOriginal: "0000:00:00 00:00:00" }).date).toBeUndefined());
  it("copies nothing outside the allow-list", () =>
    expect(mapExif({ GPSLatitude: 1, SerialNumber: "A", OwnerName: "B" })).toEqual({}));
  it("keeps fractional focal lengths", () =>
    expect(mapExif({ FocalLength: "8.8 mm" }).focalLength).toBe("8.8mm"));
});

describe("readExif", () => {
  it("reads a real file in a folder with a space", async () => {
    const file = join(await tempDir(), "shot.jpg");
    await sharp({ create: { width: 8, height: 8, channels: 3, background: "#888" } })
      .jpeg()
      .toFile(file);
    await writeTestTags(file, { ...tags, GPSLatitude: 1, GPSLongitude: 2, SerialNumber: "A" });
    expect(await readExif(file)).toEqual({
      date: "2026-08-17", camera: "Fujifilm X-T5", lens: "XF23mmF1.4 R LM WR",
      focalLength: "23mm", aperture: "f/5.6", shutter: "1/250s", iso: 200,
    });
  });
});
