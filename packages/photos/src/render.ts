import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { readTags } from "./exif";

sharp.concurrency(2);
sharp.cache(false);

// Everything that shapes the output. It is hashed into the publish cache key, so
// changing a value here re-encodes photos. Bump `version` for changes made elsewhere in this file.
export const RENDER_SETTINGS = {
  version: "1",
  widths: [640, 1024, 1600, 2400],
  avif: { quality: 50, effort: 4 },
  webp: { quality: 75 },
  placeholderWidth: 24,
  watermark: {
    minTextHeight: 13,
    textHeightRatio: 0.016,
    minMargin: 10,
    marginRatio: 0.012,
    padRatio: 0.5,
    blurRatio: 0.1,
    blurSmall: 0.5,
    shadowBase: 0.45,
    shadowSmall: 0.45,
    textOpacity: 0.8,
  },
};

const assets = join(import.meta.dirname, "..", "assets");

let watermarkSvgHash: Promise<string> | undefined;

export async function renderFingerprint(): Promise<string> {
  watermarkSvgHash ??= readFile(join(assets, "watermark.svg")).then((svg) => createHash("sha256").update(svg).digest("hex"));
  return createHash("sha256").update(JSON.stringify(RENDER_SETTINGS)).update(await watermarkSvgHash).digest("hex");
}

export function isAdobeRgb(tags: Record<string, unknown>): boolean {
  const interop = tags.InteropIndex;
  if (typeof interop === "string" && interop.trim().startsWith("R03")) return true;
  const space = tags.ColorSpace;
  return space === "Uncalibrated" || space === 65535;
}

let adobeProfile: Promise<Buffer> | undefined;
let watermark: Promise<{ d: string; x: number; y: number; w: number; h: number }> | undefined;

function loadWatermark() {
  watermark ??= readFile(join(assets, "watermark.svg"), "utf8").then((svg) => {
    const box = /viewBox="([^"]+)"/.exec(svg)?.[1]?.split(/\s+/).map(Number);
    const d = /<path d="([^"]+)"/.exec(svg)?.[1];
    if (!box || box.length !== 4 || !d) throw new Error("watermark.svg is malformed");
    return { d, x: box[0]!, y: box[1]!, w: box[2]!, h: box[3]! };
  });
  return watermark;
}

function withAdobeProfile(jpeg: Buffer, profile: Buffer): Buffer {
  const header = Buffer.concat([Buffer.from("ICC_PROFILE\0", "latin1"), Buffer.from([1, 1])]);
  const length = 2 + header.length + profile.length;
  const segment = Buffer.concat([Buffer.from([0xff, 0xe2, length >> 8, length & 0xff]), header, profile]);
  return Buffer.concat([jpeg.subarray(0, 2), segment, jpeg.subarray(2)]);
}

async function loadSource(file: string): Promise<Buffer> {
  const buffer = await readFile(file);
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
  if (!isJpeg || !isAdobeRgb(await readTags(file))) return buffer;
  if ((await sharp(buffer).metadata()).icc) return buffer;
  adobeProfile ??= readFile(join(assets, "AdobeCompat-v2.icc"));
  return withAdobeProfile(buffer, await adobeProfile);
}

async function watermarkOverlay(width: number, height: number) {
  const mark = await loadWatermark();
  const wm = RENDER_SETTINGS.watermark;
  const textHeight = Math.max(wm.minTextHeight, width * wm.textHeightRatio);
  const margin = Math.max(wm.minMargin, width * wm.marginRatio);
  const scale = textHeight / mark.h;
  const textWidth = mark.w * scale;
  const pad = Math.ceil(textHeight * wm.padRatio);
  const boxW = Math.ceil(textWidth + pad * 2);
  const boxH = Math.ceil(textHeight + pad * 2);
  const small = Math.min(1, wm.minTextHeight / textHeight);
  const blur = textHeight * wm.blurRatio + wm.blurSmall * small;
  const shadow = wm.shadowBase + wm.shadowSmall * small;
  const place = `translate(${pad} ${pad}) scale(${scale}) translate(${-mark.x} ${-mark.y})`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${boxW}" height="${boxH}" viewBox="0 0 ${boxW} ${boxH}">` +
    `<defs><filter id="b" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="${blur}"/></filter></defs>` +
    `<g filter="url(#b)" opacity="${shadow}"><g transform="${place}"><path fill="#000" d="${mark.d}"/></g></g>` +
    `<g opacity="${wm.textOpacity}"><g transform="${place}"><path fill="#fff" d="${mark.d}"/></g></g></svg>`;
  return {
    input: Buffer.from(svg),
    left: Math.max(0, Math.round(width - margin - textWidth - pad)),
    top: Math.max(0, Math.round(height - margin - textHeight - pad)),
  };
}

export async function renderPhoto(
  sourceFile: string,
  id: string,
  outDir: string,
): Promise<{ width: number; height: number; placeholder: string; widths: number[] }> {
  const source = await loadSource(sourceFile);
  const oriented = sharp(source).rotate().toColourspace("srgb");
  const { data: base, info } = await oriented.raw().toBuffer({ resolveWithObject: true });
  const widths = RENDER_SETTINGS.widths.filter((w) => w <= info.width);
  if (widths.length === 0) widths.push(info.width);

  await mkdir(outDir, { recursive: true });
  const rawInput = { raw: { width: info.width, height: info.height, channels: info.channels } };
  let largest = { width: info.width, height: info.height };

  for (const width of widths) {
    const resized = await sharp(base, rawInput)
      .resize(width, undefined, { withoutEnlargement: true })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { width: w, height: h, channels } = resized.info;
    const overlay = await watermarkOverlay(w, h);
    const marked = () => sharp(resized.data, { raw: { width: w, height: h, channels } }).composite([overlay]);
    await marked().avif(RENDER_SETTINGS.avif).toFile(join(outDir, `${id}-${width}.avif`));
    await marked().webp(RENDER_SETTINGS.webp).toFile(join(outDir, `${id}-${width}.webp`));
    largest = { width: w, height: h };
  }

  const tiny = await sharp(base, rawInput).resize(RENDER_SETTINGS.placeholderWidth).webp({ quality: 50 }).toBuffer();
  return {
    ...largest,
    placeholder: `data:image/webp;base64,${tiny.toString("base64")}`,
    widths,
  };
}
