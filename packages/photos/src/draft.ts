import { existsSync, readdirSync, readFileSync } from "node:fs";
import { rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { eventSchema, type Event, type Photo } from "@gallery/core";
import { readExif } from "./exif";

export type DraftPhoto = {
  file: string;
  id: string;
  alt: string;
  tags: string[];
  exif: Photo["exif"];
};

export type Draft = {
  title: string;
  date: string;
  coverPhotoId: string;
  photos: DraftPhoto[];
};

const DRAFT_FILE = "event.json";
const CACHE_FILE = ".photos-cache.json";
const IGNORED = new Set([DRAFT_FILE, CACHE_FILE, "desktop.ini", "thumbs.db"]);

const byName = (a: string, b: string) => a.toLowerCase().localeCompare(b.toLowerCase(), "en") || (a < b ? -1 : a > b ? 1 : 0);

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort(byName);
}

const isPhoto = (name: string) => /\.jpe?g$/i.test(name);

export function listPhotoFiles(dir: string): string[] {
  return files(dir).filter(isPhoto);
}

export function findUnsupported(dir: string): string[] {
  return files(dir).filter(
    (name) => !isPhoto(name) && !name.startsWith(".") && !IGNORED.has(name.toLowerCase()),
  );
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, "utf8").replace(/^﻿/, ""));
  } catch (error) {
    throw new Error(`Could not read ${file}: ${(error as Error).message}`);
  }
}

export function readDraft(dir: string): Draft | undefined {
  const file = join(dir, DRAFT_FILE);
  if (!existsSync(file)) return undefined;
  const draft = readJson(file) as Partial<Draft> | null;
  if (!draft || typeof draft !== "object" || !Array.isArray(draft.photos)) {
    throw new Error(`${file} is not a draft: expected an object with a "photos" list`);
  }
  return draft as Draft;
}

async function writeJson(file: string, value: unknown): Promise<void> {
  const temp = `${file}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2) + "\n");
  await rename(temp, file);
}

function readCache(dir: string): { lastId: number; [key: string]: unknown } {
  const file = join(dir, CACHE_FILE);
  if (!existsSync(file)) return { lastId: 0 };
  const cache = readJson(file) as { lastId?: unknown } | null;
  if (!cache || typeof cache !== "object" || Array.isArray(cache)) {
    throw new Error(`${file} is not a cache object`);
  }
  const lastId = typeof cache.lastId === "number" && cache.lastId > 0 ? cache.lastId : 0;
  return { ...cache, lastId };
}

const formatId = (n: number) => String(n).padStart(2, "0");

export async function syncDraft(dir: string): Promise<{
  draft: Draft;
  created: boolean;
  added: string[];
  noExif: string[];
}> {
  const existing = readDraft(dir);
  const cache = readCache(dir);
  const draft: Draft = existing ?? { title: "", date: "", coverPhotoId: "", photos: [] };
  const known = new Set(draft.photos.map((p) => p.file));
  const added = listPhotoFiles(dir).filter((name) => !known.has(name));

  let lastId = draft.photos.reduce((max, p) => {
    const n = /^\d+$/.test(p.id) ? Number(p.id) : 0;
    return Math.max(max, n);
  }, cache.lastId);

  const photos = [...draft.photos];
  for (const file of added) {
    const exif = await readExif(join(dir, file)).catch(() => ({}));
    photos.push({ file, id: formatId(++lastId), alt: "", tags: [], exif });
  }
  const next: Draft = { ...draft, photos };

  if (!existing) {
    const dates = photos.map((p) => p.exif?.date).filter((d): d is string => !!d).sort();
    next.date = dates[0] ?? "";
    next.coverPhotoId = photos[0]?.id ?? "";
  }

  if (lastId !== cache.lastId) await writeJson(join(dir, CACHE_FILE), { ...cache, lastId });
  if (!existing || added.length > 0) await writeJson(join(dir, DRAFT_FILE), next);

  const noExif = photos.filter((p) => Object.keys(p.exif ?? {}).length === 0).map((p) => p.file);
  return { draft: next, created: !existing, added, noExif };
}

export function draftProblems(draft: Draft, dir: string): string[] {
  const problems: string[] = [];
  const label = (photo: DraftPhoto) => `${photo.file} (${photo.id})`;

  if (!draft.title?.trim()) problems.push("title: is empty");
  if (!draft.date) problems.push("date: is empty");
  for (const photo of draft.photos) {
    if (!photo.alt?.trim()) problems.push(`${label(photo)} alt: is empty`);
  }

  // Reuse the site schema for formats; blanks are reported above, so stand in a value here.
  const candidate = {
    slug: "draft",
    title: draft.title?.trim() ? draft.title : "x",
    date: draft.date || "2000-01-01",
    coverPhotoId: draft.coverPhotoId,
    photos: draft.photos.map((photo) => ({
      id: photo.id,
      width: 1,
      height: 1,
      alt: photo.alt?.trim() ? photo.alt : "x",
      tags: photo.tags,
      placeholder: "data:image/png;base64,",
      exif: photo.exif,
    })),
  };
  const result = eventSchema.safeParse(candidate);
  if (!result.success) {
    for (const issue of result.error.issues) {
      const [first, index, ...rest] = issue.path;
      const field = rest.map((key) => (typeof key === "number" ? `[${key}]` : `.${String(key)}`));
      const where =
        first === "photos" && typeof index === "number" && draft.photos[index]
          ? `${label(draft.photos[index])} ${field.join("").replace(/^\./, "")}`.trim()
          : issue.path.map(String).join(".");
      problems.push(`${where}: ${issue.message}`);
    }
  }

  const idsByFile = new Map<string, string[]>();
  for (const photo of draft.photos) idsByFile.set(photo.file, [...(idsByFile.get(photo.file) ?? []), photo.id]);
  for (const [file, ids] of idsByFile) {
    if (ids.length > 1) problems.push(`${file}: listed more than once (ids ${ids.join(", ")})`);
  }

  const present = new Set(listPhotoFiles(dir));
  const listed = new Set(draft.photos.map((p) => p.file));
  for (const photo of draft.photos) {
    if (!present.has(photo.file)) problems.push(`${label(photo)}: no file named ${photo.file} in the folder`);
  }
  for (const file of present) {
    if (!listed.has(file)) problems.push(`${file}: file has no entry in ${DRAFT_FILE}`);
  }
  return problems;
}

export function toEvent(
  slug: string,
  draft: Draft,
  photos: Map<string, { width: number; height: number; placeholder: string }>,
): Event {
  return eventSchema.parse({
    slug,
    title: draft.title,
    date: draft.date,
    coverPhotoId: draft.coverPhotoId,
    photos: draft.photos.map((photo) => {
      const rendered = photos.get(photo.id);
      if (!rendered) throw new Error(`No rendered data for photo ${photo.id} (${photo.file})`);
      return {
        id: photo.id,
        width: rendered.width,
        height: rendered.height,
        alt: photo.alt,
        tags: photo.tags,
        placeholder: rendered.placeholder,
        exif: photo.exif,
      };
    }),
  });
}
