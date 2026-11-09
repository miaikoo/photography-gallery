import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";
import sharp from "sharp";
import { readGroupedTags } from "./exif";

export type PrivacyRoot = { photosDir: string; contentRoot: string; repoRoot: string };

const BAD_GROUPS = new Set(["EXIF", "XMP", "IPTC", "GPS", "MakerNotes", "Photoshop"]);
const BAD_NAME = /gps|serial|owner|artist|creator|copyright/i;
const BAD_KEY = /gps|latitude|longitude/i;
const SIGNATURES = ["Exif\0\0", "<x:xmpmeta"];
const NEVER_TRACKED = /(\.(jpe?g|raf|cr[23]|nef|arw|dng|orf|rw2|heic|tiff?)|(^|\/)(event\.json|\.photos-cache\.json))$/i;
const PUBLIC_IMAGE = /\.(avif|webp)$/i;

async function walk(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(path)));
    else out.push(path);
  }
  return out.sort();
}

export function classifyTag(key: string): string | undefined {
  const [group = "", ...rest] = key.split(":");
  const name = rest.join(":") || group;
  if (rest.length > 0 && BAD_GROUPS.has(group)) return `has ${key}`;
  if (BAD_NAME.test(name)) return `has ${key}`;
  return undefined;
}

const MIME_BY_EXT: Record<string, string> = { avif: "image/avif", webp: "image/webp" };

function riffProblems(bytes: Buffer): string[] {
  if (bytes.length < 12 || bytes.toString("latin1", 0, 4) !== "RIFF" || bytes.toString("latin1", 8, 12) !== "WEBP") {
    return ["is not a RIFF WebP file"];
  }
  const problems: string[] = [];
  if (bytes.length === 12) return ["has no image data"];
  let pos = 12;
  while (pos < bytes.length) {
    if (pos + 8 > bytes.length) return [...problems, "has a truncated chunk header"];
    const id = bytes.toString("latin1", pos, pos + 4);
    const size = bytes.readUInt32LE(pos + 4);
    if (pos + 8 + size > bytes.length) return [...problems, `has a "${id}" chunk that overruns the file`];
    if (id === "EXIF" || id === "XMP ") problems.push(`has a "${id.trim()}" chunk`);
    if (id === "VP8X" && size >= 1) {
      const flags = bytes[pos + 8] ?? 0;
      if (flags & 0x08) problems.push("declares EXIF data in its VP8X flags");
      if (flags & 0x04) problems.push("declares XMP data in its VP8X flags");
    }
    pos += 8 + size + (size % 2);
  }
  return problems;
}

function avifProblems(bytes: Buffer): string[] {
  const problems: string[] = [];
  for (let i = bytes.indexOf("infe", 0, "latin1"); i >= 0; i = bytes.indexOf("infe", i + 4, "latin1")) {
    const at = i + (bytes[i + 4] === 3 ? 14 : 12);
    if (bytes.toString("latin1", at, at + 4) === "Exif") problems.push("has an Exif item");
  }
  return problems;
}

export function byteProblems(bytes: Buffer, ext: string): string[] {
  const problems = ext === "webp" ? riffProblems(bytes) : avifProblems(bytes);
  for (const signature of SIGNATURES) {
    if (bytes.includes(signature, 0, "latin1")) {
      problems.push(`contains ${JSON.stringify(signature.replace(/\0/g, ""))} metadata bytes`);
    }
  }
  return problems;
}

export function readerProblems(tags: Record<string, unknown>, ext: string): string[] {
  const problems: string[] = [];
  const mime = tags["File:MIMEType"];
  if (mime !== MIME_BY_EXT[ext]) problems.push(`is ${String(mime)}, not ${MIME_BY_EXT[ext]}`);
  for (const key of ["ExifTool:Warning", "ExifTool:Error"]) {
    if (tags[key] !== undefined) problems.push(`${key}: ${JSON.stringify(tags[key])}`);
  }
  for (const key of ["errors", "warnings"]) {
    const list = tags[key];
    if (Array.isArray(list) && list.length > 0) problems.push(`${key}: ${JSON.stringify(list)}`);
  }
  for (const key of Object.keys(tags)) {
    const problem = classifyTag(key);
    if (problem) problems.push(problem);
  }
  return problems;
}

async function checkImage(file: string, label: string): Promise<string[]> {
  const ext = extname(file).slice(1).toLowerCase();
  let tags: Record<string, unknown>;
  try {
    tags = await readGroupedTags(file);
  } catch (error) {
    return [`${label}: could not read metadata (${(error as Error).message})`];
  }
  const problems = [...readerProblems(tags, ext), ...byteProblems(await readFile(file), ext)];
  try {
    await sharp(file, { failOn: "warning" }).raw().toBuffer();
  } catch (error) {
    problems.push(`does not decode (${(error as Error).message})`);
  }
  return problems.map((problem) => `${label}: ${problem}`);
}

function badKeys(value: unknown, path: string, out: string[]): void {
  if (Array.isArray(value)) value.forEach((item, i) => badKeys(item, `${path}[${i}]`, out));
  else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (BAD_KEY.test(key)) out.push(`${path}.${key}`);
      badKeys(child, `${path}.${key}`, out);
    }
  }
}

async function checkContent(contentRoot: string): Promise<string[]> {
  const problems: string[] = [];
  for (const file of (await walk(contentRoot)).filter((f) => f.toLowerCase().endsWith(".json"))) {
    const label = relative(contentRoot, file).replace(/\\/g, "/");
    let parsed: unknown;
    try {
      parsed = JSON.parse((await readFile(file, "utf8")).replace(/^﻿/, ""));
    } catch (error) {
      problems.push(`content/${label}: not valid JSON (${(error as Error).message})`);
      continue;
    }
    const found: string[] = [];
    badKeys(parsed, "$", found);
    for (const where of found) problems.push(`content/${label}: location key at ${where}`);
  }
  return problems;
}

function checkGit(repoRoot: string): string[] {
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", repoRoot, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 256 * 1024 * 1024,
    });
  try {
    const inside = git("rev-parse", "--is-inside-work-tree").trim();
    if (inside !== "true") return [`git check failed: repoRoot is not inside a work tree (rev-parse said "${inside}")`];
    return git("ls-files", "-z")
      .split("\0")
      .filter(Boolean)
      .flatMap((file) => {
        if (file.startsWith("originals/")) return [`${file}: original photo is tracked by git`];
        if (NEVER_TRACKED.test(file)) return [`${file}: photo or draft file is tracked or staged by git`];
        return [];
      });
  } catch (error) {
    const { code, stderr } = error as { code?: string; stderr?: unknown };
    const text = String(stderr ?? "");
    if (code === "ENOENT" || text.includes("not a git repository")) return [];
    return [`git check failed: ${text.trim() || (error as Error).message}`];
  }
}

export async function checkPrivacy(root: PrivacyRoot): Promise<string[]> {
  const problems: string[] = [];
  for (const file of await walk(root.photosDir)) {
    const label = relative(root.photosDir, file).replace(/\\/g, "/");
    if (!PUBLIC_IMAGE.test(file)) {
      if (basename(file) !== ".gitkeep") problems.push(`${label}: not an AVIF or WebP file`);
      continue;
    }
    problems.push(...(await checkImage(file, label)));
  }
  problems.push(...(await checkContent(root.contentRoot)));
  problems.push(...checkGit(root.repoRoot));
  return problems;
}
