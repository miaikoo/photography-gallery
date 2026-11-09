import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { draftProblems, findUnsupported, syncDraft, toEvent } from "./draft";
import { renderFingerprint, renderPhoto } from "./render";

export type Paths = { contentDir: string; photosDir: string };

export type RunResult = {
  status: "draft-created" | "draft-updated" | "needs-edits" | "published";
  messages: string[];
  rendered: number;
  reused: number;
};

type CacheEntry = { hash: string; width: number; height: number; placeholder: string; widths: number[] };

const CACHE_FILE = ".photos-cache.json";
const FORMATS = ["avif", "webp"];
const WIDTH_COUNT = 4;
const ATTEMPTS = 5;
const RETRY_MS = 300;

export function slugFromFolder(dir: string): string {
  const name = basename(dir.replace(/[\\/]+$/, "").replace(/\\/g, "/"));
  if (/^[a-z0-9-]+$/.test(name)) return name;
  const suggestion = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  throw new Error(
    `Folder name "${name}" can't be used as an event name: use lowercase letters, numbers and hyphens only` +
      (suggestion ? `. Try renaming it to "${suggestion}"` : ""),
  );
}

export async function swapWithRetry(from: string, to: string, move: typeof rename = rename): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await move(from, to);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if ((code !== "EPERM" && code !== "EBUSY") || attempt >= ATTEMPTS) throw error;
      await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
    }
  }
}

async function readCache(file: string): Promise<{ lastId?: number; photos: Record<string, CacheEntry> }> {
  if (!existsSync(file)) return { photos: {} };
  const cache = JSON.parse((await readFile(file, "utf8")).replace(/^﻿/, ""));
  return { ...cache, photos: cache.photos && typeof cache.photos === "object" ? cache.photos : {} };
}

const processError = (file: string, error: unknown) =>
  new Error(`Could not process ${file}: ${(error as Error).message}`, { cause: error });

const fileNames = (id: string, widths: number[]) =>
  widths.flatMap((w) => FORMATS.map((ext) => `${id}-${w}.${ext}`));

async function hashSource(file: string): Promise<string> {
  return createHash("sha256").update(await readFile(file)).update(`\0${await renderFingerprint()}`).digest("hex");
}

export async function runEvent(
  sourceDir: string,
  paths: Paths,
  onPhoto?: (file: string, status: "encoded" | "reused") => void,
  remove: typeof rm = rm,
): Promise<RunResult> {
  const slug = slugFromFolder(sourceDir);

  const unsupported = findUnsupported(sourceDir);
  if (unsupported.length > 0) {
    throw new Error(`Unsupported files in ${sourceDir}: ${unsupported.join(", ")}. Only JPEG photos are supported`);
  }

  const { draft, created, added, noExif } = await syncDraft(sourceDir);
  const exifNote = noExif.length > 0 ? [`No camera data found in: ${noExif.join(", ")}`] : [];
  if (created) {
    return {
      status: "draft-created",
      messages: [`Created event.json with ${draft.photos.length} photos. Fill in the title, date and alt text, then run again`, ...exifNote],
      rendered: 0,
      reused: 0,
    };
  }
  if (added.length > 0) {
    return {
      status: "draft-updated",
      messages: [`Added ${added.join(", ")} to event.json. Fill in their alt text, then run again. To drop a photo instead, move its file out of the folder and delete its entry in event.json`, ...exifNote],
      rendered: 0,
      reused: 0,
    };
  }
  const problems = draftProblems(draft, sourceDir);
  if (problems.length > 0) return { status: "needs-edits", messages: problems, rendered: 0, reused: 0 };

  const final = join(paths.photosDir, slug);
  const temp = join(paths.photosDir, `.tmp-${slug}`);
  const old = join(paths.photosDir, `.old-${slug}`);
  const json = join(paths.contentDir, `${slug}.json`);
  const jsonTemp = `${json}.tmp`;
  const cacheFile = join(sourceDir, CACHE_FILE);

  await mkdir(paths.photosDir, { recursive: true });
  await mkdir(paths.contentDir, { recursive: true });
  await rm(temp, { recursive: true, force: true });
  await rm(old, { recursive: true, force: true });

  let rendered = 0;
  let reused = 0;
  let keepOld = false;
  let result: RunResult | undefined;
  try {
    await mkdir(temp);
    const cache = await readCache(cacheFile);
    const entries: Record<string, CacheEntry> = {};
    const data = new Map<string, { width: number; height: number; placeholder: string }>();

    for (const photo of draft.photos) {
      const source = join(sourceDir, photo.file);
      let hash: string;
      try {
        hash = await hashSource(source);
      } catch (error) {
        throw processError(photo.file, error);
      }
      const cached = cache.photos[photo.id];
      const names = cached ? fileNames(photo.id, cached.widths) : [];
      if (cached && cached.hash === hash && names.every((name) => existsSync(join(final, name)))) {
        for (const name of names) await copyFile(join(final, name), join(temp, name));
        entries[photo.id] = cached;
        reused++;
        onPhoto?.(photo.file, "reused");
      } else {
        const result = await renderPhoto(source, photo.id, temp).catch((error) => {
          throw processError(photo.file, error);
        });
        entries[photo.id] = { hash, ...result };
        rendered++;
        onPhoto?.(photo.file, "encoded");
      }
      const { width, height, placeholder } = entries[photo.id]!;
      data.set(photo.id, { width, height, placeholder });
    }

    const fewer = draft.photos.filter((p) => entries[p.id]!.widths.length < WIDTH_COUNT).map((p) => p.file);
    const event = toEvent(slug, draft, data);
    await writeFile(jsonTemp, JSON.stringify(event, null, 2) + "\n");

    const hadPrevious = existsSync(final);
    if (hadPrevious) await swapWithRetry(final, old);
    try {
      await swapWithRetry(temp, final);
      await swapWithRetry(jsonTemp, json);
    } catch (error) {
      if (hadPrevious) {
        keepOld = true;
        await rm(final, { recursive: true, force: true });
        await swapWithRetry(old, final);
        keepOld = false;
      }
      throw error;
    }

    const latest = await readCache(cacheFile);
    await writeFile(cacheFile, JSON.stringify({ ...latest, photos: entries }, null, 2) + "\n");
    result = {
      status: "published",
      messages: [
        `Published ${slug}: ${rendered} encoded, ${reused} reused`,
        ...(fewer.length > 0 ? [`Smaller than 2400px, so published with fewer sizes: ${fewer.join(", ")}`] : []),
      ],
      rendered,
      reused,
    };
    return result;
  } finally {
    // A failed cleanup must not hide the run's own error, or turn a finished publish into a failure.
    const leftovers = [jsonTemp, temp, ...(keepOld ? [] : [old])];
    for (const path of leftovers) {
      try {
        await remove(path, { recursive: true, force: true, maxRetries: ATTEMPTS, retryDelay: RETRY_MS });
      } catch (error) {
        result?.messages.push(`Published, but could not delete the leftover ${path}: ${(error as Error).message}. Delete it by hand`);
      }
    }
  }
}
