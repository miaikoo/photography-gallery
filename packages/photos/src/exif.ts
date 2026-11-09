import { ExifTool, ExifDateTime, ExifDate } from "exiftool-vendored";
import type { Photo } from "@gallery/core";

type Exif = Photo["exif"];

let tool: ExifTool | undefined;

function getTool(): ExifTool {
  tool ??= new ExifTool({ maxProcs: 1 });
  return tool;
}

export async function closeExif(): Promise<void> {
  const current = tool;
  tool = undefined;
  await current?.end();
}

export async function readTags(file: string): Promise<Record<string, unknown>> {
  return { ...(await getTool().read(file)) };
}

export async function readGroupedTags(file: string): Promise<Record<string, unknown>> {
  return { ...(await getTool().readRaw(file, { readArgs: ["-G0"] })) };
}

export async function readExif(file: string): Promise<Exif> {
  return mapExif(await readTags(file));
}

function text(value: unknown): string | undefined {
  if (value instanceof ExifDateTime || value instanceof ExifDate) return value.rawValue;
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number") return String(value);
  return undefined;
}

function num(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number.parseFloat(text(value) ?? "");
  return Number.isFinite(n) ? n : undefined;
}

function titleCase(word: string): string {
  return word === word.toUpperCase() ? word.charAt(0) + word.slice(1).toLowerCase() : word;
}

function mapDate(value: unknown): string | undefined {
  const match = /^(\d{4}):(\d{2}):(\d{2})/.exec(text(value) ?? "");
  if (!match || match[1] === "0000") return undefined;
  const [, y, m, d] = match;
  const date = `${y}-${m}-${d}`;
  return Number.isNaN(Date.parse(date)) ? undefined : date;
}

function mapCamera(make: unknown, model: unknown): string | undefined {
  const brand = text(make);
  const name = text(model);
  if (!name) return brand ? titleCase(brand) : undefined;
  if (!brand) return name;
  const shown = titleCase(brand);
  return name.toLowerCase().startsWith(brand.toLowerCase()) ||
    name.toLowerCase().startsWith(shown.toLowerCase())
    ? name
    : `${shown} ${name}`;
}

function mapFocalLength(value: unknown): string | undefined {
  const n = num(value);
  return n && n > 0 ? `${Number.isInteger(n) ? n : Number(n.toFixed(1))}mm` : undefined;
}

function mapAperture(value: unknown): string | undefined {
  const n = num(value);
  return n && n > 0 ? `f/${Number(n.toFixed(1))}` : undefined;
}

function mapShutter(value: unknown): string | undefined {
  const raw = text(value);
  if (!raw) return undefined;
  if (raw.includes("/")) return `${raw}s`;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n < 1 ? `1/${Math.round(1 / n)}s` : `${n}s`;
}

function mapIso(value: unknown): number | undefined {
  const n = num(value);
  return n && Number.isInteger(n) && n > 0 ? n : undefined;
}

export function mapExif(tags: Record<string, unknown>): Exif {
  const out: Exif = {
    date: mapDate(tags.DateTimeOriginal),
    camera: mapCamera(tags.Make, tags.Model),
    lens: text(tags.LensModel),
    focalLength: mapFocalLength(tags.FocalLength),
    aperture: mapAperture(tags.FNumber),
    shutter: mapShutter(tags.ExposureTime),
    iso: mapIso(tags.ISO),
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined)) as Exif;
}
