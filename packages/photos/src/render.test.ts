import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeExif, readTags } from "./exif";
import { RENDER_SETTINGS, isAdobeRgb, renderFingerprint, renderPhoto } from "./render";
import { tempDir, writeTestTags } from "./test-utils";

const ICC = join(import.meta.dirname, "..", "assets", "AdobeCompat-v2.icc");
const WIDTHS = [640, 1024, 1600, 2400];

type Pixels = { data: Buffer; width: number; height: number };
type Box = { x0: number; y0: number; x1: number; y1: number };

async function gradient(file: string, width: number, height: number, orientation?: number) {
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      data[i] = 20 + Math.round((x / width) * 150);
      data[i + 1] = 30 + Math.round((y / height) * 120);
      data[i + 2] = 60 + Math.round(((x + y) / (width + height)) * 100);
    }
  }
  const img = sharp(data, { raw: { width, height, channels: 3 } });
  await (orientation ? img.withMetadata({ orientation }) : img).jpeg({ quality: 95 }).toFile(file);
}

async function solid(file: string, rgb: [number, number, number], profile = false) {
  let img = sharp({
    create: { width: 800, height: 600, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } },
  });
  if (profile) img = img.withIccProfile(ICC);
  await img.jpeg({ quality: 95 }).toFile(file);
}

async function pixels(input: string | Buffer, resizeTo?: number): Promise<Pixels> {
  let img = sharp(input).rotate();
  if (resizeTo) img = img.resize(resizeTo);
  const { data, info } = await img.removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function meanDiff(a: Pixels, b: Pixels, box: Box) {
  let sum = 0;
  let n = 0;
  for (let y = box.y0; y < box.y1; y++) {
    for (let x = box.x0; x < box.x1; x++) {
      const i = (y * a.width + x) * 3;
      for (let c = 0; c < 3; c++) sum += Math.abs(a.data[i + c]! - b.data[i + c]!);
      n += 3;
    }
  }
  return sum / n;
}

function saturation(p: Pixels, box: Box) {
  let sum = 0;
  let n = 0;
  for (let y = box.y0; y < box.y1; y++) {
    for (let x = box.x0; x < box.x1; x++) {
      const i = (y * p.width + x) * 3;
      const px = [p.data[i]!, p.data[i + 1]!, p.data[i + 2]!];
      const max = Math.max(...px);
      sum += max ? (max - Math.min(...px)) / max : 0;
      n++;
    }
  }
  return sum / n;
}

async function embedIcc(jpeg: Buffer): Promise<Buffer> {
  const profile = await readFile(ICC);
  const header = Buffer.concat([Buffer.from("ICC_PROFILE\0", "latin1"), Buffer.from([1, 1])]);
  const length = 2 + header.length + profile.length;
  const segment = Buffer.concat([Buffer.from([0xff, 0xe2, length >> 8, length & 0xff]), header, profile]);
  return Buffer.concat([jpeg.subarray(0, 2), segment, jpeg.subarray(2)]);
}

async function changedBox(got: Pixels, want: Pixels, threshold: number) {
  let box = { x0: Infinity, y0: Infinity, x1: -1, y1: -1 };
  for (let y = 0; y < got.height; y++) {
    for (let x = 0; x < got.width; x++) {
      const i = (y * got.width + x) * 3;
      const d = Math.max(...[0, 1, 2].map((c) => Math.abs(got.data[i + c]! - want.data[i + c]!)));
      if (d > threshold) box = { x0: Math.min(box.x0, x), y0: Math.min(box.y0, y), x1: Math.max(box.x1, x + 1), y1: Math.max(box.y1, y + 1) };
    }
  }
  return box;
}

const out = (dir: string, id: string, w: number, ext: string) => join(dir, `${id}-${w}.${ext}`);
const PROBE: Box = { x0: 0, y0: 0, x1: 100, y1: 100 };

let shared: string;
let sharedSource: string;
let sharedOut: string;
let sharedResult: Awaited<ReturnType<typeof renderPhoto>>;
const sharedTags = {
  Make: "TestMake",
  Model: "TestModel",
  Artist: "Test Artist",
  Copyright: "Test Copyright",
  ImageDescription: "Test description",
};

beforeAll(async () => {
  shared = await mkdtemp(join(tmpdir(), "gallery render "));
  sharedSource = join(shared, "source.jpg");
  sharedOut = join(shared, "out");
  await gradient(sharedSource, 3000, 2000);
  await writeTestTags(sharedSource, sharedTags);
  sharedResult = await renderPhoto(sharedSource, "abc", sharedOut);
});

afterAll(async () => {
  await closeExif();
  await rm(shared, { recursive: true, force: true });
});

describe("renderPhoto", () => {
  it("exposes a render version", () => {
    expect(RENDER_SETTINGS.version).toMatch(/\S/);
  });

  it("fingerprint changes with a shadow constant and returns to its value when restored", async () => {
    const before = await renderFingerprint();
    const shadow = RENDER_SETTINGS.watermark.shadowSmall;
    try {
      RENDER_SETTINGS.watermark.shadowSmall = shadow + 0.1;
      expect(await renderFingerprint()).not.toBe(before);
    } finally {
      RENDER_SETTINGS.watermark.shadowSmall = shadow;
    }
    expect(await renderFingerprint()).toBe(before);
  });

  it("outputs AVIF and WebP at 640, 1024, 1600, and 2400 for a 3000px source", async () => {
    expect(sharedResult.widths).toEqual(WIDTHS);
    for (const w of WIDTHS) {
      for (const ext of ["avif", "webp"]) {
        const meta = await sharp(out(sharedOut, "abc", w, ext)).metadata();
        expect(meta.width).toBe(w);
        expect(meta.format).toBe(ext === "avif" ? "heif" : "webp");
      }
    }
  });

  it("skips widths larger than the source", async () => {
    const dir = await tempDir();
    const src = join(dir, "s.jpg");
    await gradient(src, 1200, 800);
    const result = await renderPhoto(src, "x", join(dir, "o"));
    expect(result.widths).toEqual([640, 1024]);
    await expect(sharp(out(join(dir, "o"), "x", 1600, "webp")).metadata()).rejects.toThrow();
  });

  it("gives a source narrower than 640 one file at its own width", async () => {
    const dir = await tempDir();
    const src = join(dir, "s.jpg");
    await gradient(src, 400, 300);
    const result = await renderPhoto(src, "x", join(dir, "o"));
    expect(result).toMatchObject({ widths: [400], width: 400, height: 300 });
    expect((await sharp(out(join(dir, "o"), "x", 400, "avif")).metadata()).width).toBe(400);
    expect((await sharp(out(join(dir, "o"), "x", 400, "webp")).metadata()).width).toBe(400);
  });

  it("applies rotation, reporting portrait dimensions", async () => {
    const dir = await tempDir();
    const src = join(dir, "s.jpg");
    await gradient(src, 3000, 2000, 6);
    const result = await renderPhoto(src, "x", join(dir, "o"));
    expect(result.width).toBe(1600);
    expect(result.height).toBe(2400);
    expect(result.widths).toEqual([640, 1024, 1600]);
    const meta = await sharp(out(join(dir, "o"), "x", 640, "webp")).metadata();
    expect(meta.height! > meta.width!).toBe(true);
  });

  it("reports dimensions of the largest output, keeping the ratio", async () => {
    expect(sharedResult.width).toBe(2400);
    expect(sharedResult.height).toBe(1600);
    const meta = await sharp(out(sharedOut, "abc", 2400, "webp")).metadata();
    expect([meta.width, meta.height]).toEqual([2400, 1600]);
  });

  it("leaves no metadata in any output", async () => {
    expect(Object.keys(await readTags(sharedSource))).toEqual(expect.arrayContaining(Object.keys(sharedTags)));
    for (const w of WIDTHS) {
      for (const ext of ["avif", "webp"]) {
        const file = out(sharedOut, "abc", w, ext);
        const meta = await sharp(file).metadata();
        expect(meta.exif).toBeUndefined();
        expect(meta.xmp).toBeUndefined();
        expect(meta.icc).toBeUndefined();
        const tags = await readTags(file);
        for (const key of Object.keys(sharedTags)) expect(tags).not.toHaveProperty(key);
      }
    }
  });

  it("isAdobeRgb detects InteropIndex R03 and ColorSpace Uncalibrated, and not sRGB", async () => {
    expect(isAdobeRgb({ InteropIndex: "R03 - DCF option file (Adobe RGB)" })).toBe(true);
    expect(isAdobeRgb({ InteropIndex: "R03" })).toBe(true);
    expect(isAdobeRgb({ ColorSpace: "Uncalibrated" })).toBe(true);
    expect(isAdobeRgb({ ColorSpace: 65535 })).toBe(true);
    expect(isAdobeRgb({ ColorSpace: "sRGB" })).toBe(false);
    expect(isAdobeRgb({ InteropIndex: "R98 - DCF basic file (sRGB)", ColorSpace: "sRGB" })).toBe(false);
    expect(isAdobeRgb({})).toBe(false);

    const dir = await tempDir();
    const file = join(dir, "t.jpg");
    await solid(file, [30, 200, 60]);
    await writeTestTags(file, { InteropIndex: "R03" });
    expect(isAdobeRgb(await readTags(file))).toBe(true);
  });

  it("converts an Adobe RGB file with no profile", async () => {
    const dir = await tempDir();
    const plain = join(dir, "plain.jpg");
    const adobe = join(dir, "adobe.jpg");
    await solid(plain, [30, 200, 60]);
    await solid(adobe, [30, 200, 60]);
    await writeTestTags(adobe, { InteropIndex: "R03" });
    await renderPhoto(plain, "p", join(dir, "o"));
    await renderPhoto(adobe, "a", join(dir, "o"));
    const a = await pixels(out(join(dir, "o"), "a", 640, "webp"));
    const p = await pixels(out(join(dir, "o"), "p", 640, "webp"));
    expect(saturation(a, PROBE)).toBeGreaterThan(saturation(p, PROBE));
    const i = (20 * a.width + 20) * 3;
    const maxDiff = Math.max(...[0, 1, 2].map((c) => Math.abs(a.data[i + c]! - p.data[i + c]!)));
    expect(maxDiff).toBeGreaterThan(5);

    // Reference: the same pixels in a JPEG that really embeds the Adobe RGB profile, converted by sharp.
    const real = join(dir, "real.jpg");
    await writeFile(real, await embedIcc(await readFile(plain)));
    const ref = await pixels(await sharp(real).toColourspace("srgb").resize(640).raw().toBuffer({ resolveWithObject: true }).then(
      ({ data, info }) => sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } }).png().toBuffer(),
    ));
    expect(Math.max(...[0, 1, 2].map((c) => Math.abs(a.data[i + c]! - ref.data[i + c]!)))).toBeLessThanOrEqual(3);
    // Hand-computed Adobe RGB (30,200,60) -> sRGB is about (0,201,36).
    [0, 201, 36].forEach((v, c) => expect(Math.abs(a.data[i + c]! - v)).toBeLessThanOrEqual(10));

    for (const ext of ["avif", "webp"]) {
      expect((await sharp(out(join(dir, "o"), "a", 640, ext)).metadata()).icc).toBeUndefined();
    }
  });

  it("keeps an embedded profile rather than assuming Adobe RGB", async () => {
    const dir = await tempDir();
    const embedded = join(dir, "embedded.jpg");
    const tagged = join(dir, "tagged.jpg");
    await solid(embedded, [30, 200, 60], true);
    await solid(tagged, [30, 200, 60], true);
    await writeTestTags(tagged, { InteropIndex: "R03" });
    await renderPhoto(embedded, "e", join(dir, "o"));
    await renderPhoto(tagged, "t", join(dir, "o"));
    const e = await pixels(out(join(dir, "o"), "e", 640, "webp"));
    const t = await pixels(out(join(dir, "o"), "t", 640, "webp"));
    expect(meanDiff(e, t, PROBE)).toBeLessThan(1);
    // The profile is applied once, so the original sRGB values come back.
    const i = (20 * e.width + 20) * 3;
    const want = [30, 200, 60];
    expect(Math.max(...want.map((v, c) => Math.abs(e.data[i + c]! - v)))).toBeLessThan(6);
  });

  it("draws the watermark in the bottom right at every width", async () => {
    for (const w of WIDTHS) {
      const got = await pixels(out(sharedOut, "abc", w, "webp"));
      const ref = await sharp(await readFile(sharedSource)).resize(w).webp({ quality: 75 }).toBuffer();
      const want = await pixels(ref);
      const corner = meanDiff(got, want, {
        x0: Math.floor(got.width * 0.8),
        y0: Math.floor(got.height * 0.94),
        x1: got.width,
        y1: got.height,
      });
      const topLeft = meanDiff(got, want, { x0: 0, y0: 0, x1: got.width >> 1, y1: got.height >> 1 });
      expect(corner, `corner at ${w}`).toBeGreaterThan(3);
      expect(topLeft, `top-left at ${w}`).toBeLessThan(1);

      const textHeight = Math.max(13, w * 0.016);
      const margin = Math.max(10, w * 0.012);
      const slack = Math.ceil(textHeight * 0.3) + 2;
      const box = await changedBox(got, want, 12);
      expect(Math.abs(box.x1 - (got.width - margin)), `right edge at ${w}: ${JSON.stringify(box)}`).toBeLessThanOrEqual(slack);
      expect(Math.abs(box.y1 - (got.height - margin)), `bottom edge at ${w}: ${JSON.stringify(box)}`).toBeLessThanOrEqual(slack);
      expect(box.y1 - box.y0, `height at ${w}`).toBeGreaterThanOrEqual(textHeight);
      expect(box.x0, `left edge at ${w}`).toBeGreaterThan(got.width * 0.6);
    }
  });

  it("gives the watermark contrast on a bright background at 640", async () => {
    const dir = await tempDir();
    const src = join(dir, "bright.jpg");
    await sharp({ create: { width: 1200, height: 800, channels: 3, background: { r: 250, g: 250, b: 250 } } })
      .jpeg({ quality: 95 })
      .toFile(src);
    await renderPhoto(src, "b", join(dir, "o"));
    const got = await pixels(out(join(dir, "o"), "b", 640, "webp"));
    let darkest = 255;
    for (let y = Math.floor(got.height * 0.9); y < got.height; y++) {
      for (let x = Math.floor(got.width * 0.8); x < got.width; x++) {
        const i = (y * got.width + x) * 3;
        darkest = Math.min(darkest, got.data[i]!, got.data[i + 1]!, got.data[i + 2]!);
      }
    }
    expect(250 - darkest).toBeGreaterThanOrEqual(60);
  });

  it("keeps the watermark legible at 640", async () => {
    const got = await pixels(out(sharedOut, "abc", 640, "webp"));
    const want = await pixels(await sharp(await readFile(sharedSource)).resize(640).webp({ quality: 75 }).toBuffer());
    let minY = Infinity;
    let maxY = -1;
    let minX = Infinity;
    for (let y = 0; y < got.height; y++) {
      for (let x = 0; x < got.width; x++) {
        const i = (y * got.width + x) * 3;
        const d = Math.max(...[0, 1, 2].map((c) => Math.abs(got.data[i + c]! - want.data[i + c]!)));
        if (d > 40) {
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
          minX = Math.min(minX, x);
        }
      }
    }
    expect(maxY - minY + 1).toBeGreaterThanOrEqual(11);
    expect(minX).toBeGreaterThan(got.width / 2);
    expect(minY).toBeGreaterThan(got.height / 2);
  });

  it("makes a placeholder from the unwatermarked image", async () => {
    expect(sharedResult.placeholder.startsWith("data:image/webp;base64,")).toBe(true);
    const buf = Buffer.from(sharedResult.placeholder.split(",")[1]!, "base64");
    expect((await sharp(buf).metadata()).width).toBe(24);
    const got = await pixels(buf);
    const want = await pixels(await readFile(sharedSource), 24);
    expect(meanDiff(got, want, { x0: 0, y0: 0, x1: 24, y1: want.height })).toBeLessThan(6);
  });
});
