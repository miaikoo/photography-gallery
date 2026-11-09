import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import {
  draftProblems,
  findUnsupported,
  listPhotoFiles,
  readDraft,
  syncDraft,
  toEvent,
  type Draft,
} from "./draft";
import { closeExif } from "./exif";
import { tempDir, writeTestTags } from "./test-utils";

afterAll(closeExif);

async function jpeg(dir: string, name: string, date?: string): Promise<string> {
  const file = join(dir, name);
  await sharp({ create: { width: 8, height: 8, channels: 3, background: "#888" } })
    .jpeg()
    .toFile(file);
  if (date) await writeTestTags(file, { DateTimeOriginal: date });
  return file;
}

async function event(): Promise<string> {
  const dir = join(await tempDir(), "event one");
  await mkdir(dir);
  return dir;
}

const read = async (dir: string) => JSON.parse(await readFile(join(dir, "event.json"), "utf8"));
const cache = async (dir: string) =>
  JSON.parse(await readFile(join(dir, ".photos-cache.json"), "utf8"));

describe("syncDraft", () => {
  it("creates a draft sorted by file name, with ids 01, 02, 03", async () => {
    const dir = await event();
    for (const name of ["c.jpg", "a.jpg", "b.jpg"]) await jpeg(dir, name);
    const result = await syncDraft(dir);
    expect(result.created).toBe(true);
    expect(result.added).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
    expect(result.draft.photos.map((p) => [p.file, p.id])).toEqual([
      ["a.jpg", "01"], ["b.jpg", "02"], ["c.jpg", "03"],
    ]);
    expect(await read(dir)).toEqual(result.draft);
    expect(await readFile(join(dir, "event.json"), "utf8")).toContain('\n  "title"');
  });

  it("starts the event date at the earliest photo date, and the cover at the first photo", async () => {
    const dir = await event();
    await jpeg(dir, "a.jpg", "2026:08:17 10:00:00");
    await jpeg(dir, "b.jpg", "2026:08:15 10:00:00");
    const { draft } = await syncDraft(dir);
    expect(draft.date).toBe("2026-08-15");
    expect(draft.coverPhotoId).toBe("01");
  });

  it("leaves the date empty when no photo has one, and reports it", async () => {
    const dir = await event();
    await jpeg(dir, "a.jpg");
    const { draft } = await syncDraft(dir);
    expect(draft.date).toBe("");
    expect(draftProblems(draft, dir).join("\n")).toMatch(/date/);
  });

  it("keeps ids and order when entries were reordered", async () => {
    const dir = await event();
    await jpeg(dir, "a.jpg");
    await jpeg(dir, "b.jpg");
    const { draft } = await syncDraft(dir);
    await writeFile(
      join(dir, "event.json"),
      JSON.stringify({ ...draft, photos: [...draft.photos].reverse() }),
    );
    const again = await syncDraft(dir);
    expect(again.created).toBe(false);
    expect(again.added).toEqual([]);
    expect(again.draft.photos.map((p) => [p.file, p.id])).toEqual([["b.jpg", "02"], ["a.jpg", "01"]]);
  });

  it("appends a new file with the next unused id, and keeps every edit", async () => {
    const dir = await event();
    await jpeg(dir, "a.jpg");
    const first = await syncDraft(dir);
    const edited: Draft = {
      ...first.draft,
      title: "Beach day",
      date: "2026-08-01",
      photos: first.draft.photos.map((p) => ({ ...p, alt: "A wave", tags: ["sea"] })),
    };
    await writeFile(join(dir, "event.json"), JSON.stringify(edited, null, 2));
    await jpeg(dir, "b.jpg");
    const { draft, added } = await syncDraft(dir);
    expect(added).toEqual(["b.jpg"]);
    expect(draft.title).toBe("Beach day");
    expect(draft.date).toBe("2026-08-01");
    expect(draft.photos[0]).toEqual(edited.photos[0]);
    expect(draft.photos[1]).toMatchObject({ file: "b.jpg", id: "02", alt: "", tags: [] });
    expect(await read(dir)).toEqual(draft);
  });

  it("doesn't reuse a removed id", async () => {
    const dir = await event();
    for (const name of ["a.jpg", "b.jpg", "c.jpg"]) await jpeg(dir, name);
    const { draft } = await syncDraft(dir);
    await writeFile(
      join(dir, "event.json"),
      JSON.stringify({ ...draft, photos: draft.photos.slice(0, 2) }),
    );
    await rm(join(dir, "c.jpg"));
    await jpeg(dir, "d.jpg");
    const result = await syncDraft(dir);
    expect(result.draft.photos.map((p) => p.id)).toEqual(["01", "02", "04"]);
    expect((await cache(dir)).lastId).toBe(4);
  });

  it("preserves the photos entry of the cache", async () => {
    const dir = await event();
    const photos = { "01": { hash: "h", width: 1, height: 1, placeholder: "p", widths: [640] } };
    await writeFile(join(dir, ".photos-cache.json"), JSON.stringify({ lastId: 5, photos }));
    await jpeg(dir, "a.jpg");
    const { draft } = await syncDraft(dir);
    expect(draft.photos[0]!.id).toBe("06");
    expect(await cache(dir)).toEqual({ lastId: 6, photos });
  });

  it("doesn't rewrite a draft that has nothing to add", async () => {
    const dir = await event();
    await jpeg(dir, "a.jpg");
    await syncDraft(dir);
    const odd =
      '{"title":"Mine","date":"2026-01-01","coverPhotoId":"01","photos":' +
      '[{"file":"a.jpg","id":"01","alt":"x","tags":[],"exif":{}}]}';
    await writeFile(join(dir, "event.json"), odd);
    await syncDraft(dir);
    expect(await readFile(join(dir, "event.json"), "utf8")).toBe(odd);
  });

  it("refuses to overwrite a draft it cannot parse", async () => {
    const dir = await event();
    await jpeg(dir, "a.jpg");
    await writeFile(join(dir, "event.json"), "{ not json");
    await expect(syncDraft(dir)).rejects.toThrow(/event\.json/);
    expect(await readFile(join(dir, "event.json"), "utf8")).toBe("{ not json");
  });

  it("reports files with no EXIF", async () => {
    const dir = await event();
    await jpeg(dir, "a.jpg", "2026:08:17 10:00:00");
    await jpeg(dir, "b.jpg");
    expect((await syncDraft(dir)).noExif).toEqual(["b.jpg"]);
  });
});

describe("files", () => {
  it("matches .JPG in capitals", async () => {
    const dir = await event();
    await jpeg(dir, "B.JPG");
    await jpeg(dir, "a.Jpeg");
    await writeFile(join(dir, "c.png"), "x");
    expect(listPhotoFiles(dir)).toEqual(["a.Jpeg", "B.JPG"]);
  });

  it("ignores desktop.ini, Thumbs.db, and its own files", async () => {
    const dir = await event();
    for (const name of ["desktop.ini", "Thumbs.db", "event.json", ".photos-cache.json", ".hidden"])
      await writeFile(join(dir, name), "x");
    expect(findUnsupported(dir)).toEqual([]);
  });

  it("reports a RAW file as unsupported", async () => {
    const dir = await event();
    await writeFile(join(dir, "_DSF0011.RAF"), "x");
    await jpeg(dir, "a.jpg");
    expect(findUnsupported(dir)).toEqual(["_DSF0011.RAF"]);
  });

  it("reads a draft saved with a BOM", async () => {
    const dir = await event();
    const draft = { title: "T", date: "2026-01-01", coverPhotoId: "01", photos: [] };
    await writeFile(join(dir, "event.json"), "﻿" + JSON.stringify(draft));
    expect(readDraft(dir)).toEqual(draft);
  });

  it("returns undefined without a draft, and names the file in a parse error", async () => {
    const dir = await event();
    expect(readDraft(dir)).toBeUndefined();
    await writeFile(join(dir, "event.json"), "{ nope");
    expect(() => readDraft(dir)).toThrow(/event\.json/);
  });
});

describe("draftProblems", () => {
  const good = (): Draft => ({
    title: "T", date: "2026-01-01", coverPhotoId: "01",
    photos: [{ file: "a.jpg", id: "01", alt: "A", tags: ["sea"], exif: {} }],
  });

  it("is empty for a finished draft", async () => {
    const dir = await event();
    await jpeg(dir, "a.jpg");
    expect(draftProblems(good(), dir)).toEqual([]);
  });

  it("lists an empty title and each empty alt", async () => {
    const dir = await event();
    await jpeg(dir, "a.jpg");
    await jpeg(dir, "b.jpg");
    const draft = good();
    draft.title = " ";
    draft.photos[0]!.alt = "";
    draft.photos.push({ file: "b.jpg", id: "02", alt: "", tags: [], exif: {} });
    const problems = draftProblems(draft, dir);
    expect(problems.filter((p) => /title/.test(p))).toHaveLength(1);
    expect(problems.filter((p) => /alt/.test(p))).toHaveLength(2);
    expect(problems.some((p) => p.includes("a.jpg"))).toBe(true);
    expect(problems.some((p) => p.includes("b.jpg"))).toBe(true);
  });

  it("lists a draft entry with no file, and a file with no entry", async () => {
    const dir = await event();
    await jpeg(dir, "extra.jpg");
    const problems = draftProblems(good(), dir);
    expect(problems.some((p) => p.includes("a.jpg") && /no file/i.test(p))).toBe(true);
    expect(problems.some((p) => p.includes("extra.jpg") && /no entry/i.test(p))).toBe(true);
  });

  it("lists a file that two entries share", async () => {
    const dir = await event();
    await jpeg(dir, "a.jpg");
    const draft = good();
    draft.photos.push({ file: "a.jpg", id: "02", alt: "B", tags: [], exif: {} });
    const problems = draftProblems(draft, dir);
    expect(problems.filter((p) => p.includes("a.jpg") && /more than once/.test(p))).toHaveLength(1);
    expect(problems.some((p) => p.includes("01") && p.includes("02"))).toBe(true);
  });

  it("rejects a bad tag or date with the field named", async () => {
    const dir = await event();
    await jpeg(dir, "a.jpg");
    const draft = good();
    draft.date = "17/08/2026";
    draft.photos[0]!.tags = ["Sea Side"];
    const problems = draftProblems(draft, dir);
    expect(problems.some((p) => p.startsWith("date"))).toBe(true);
    expect(problems.some((p) => p.includes("tags") && p.includes("a.jpg"))).toBe(true);
  });

  it("rejects a bad id and a cover that matches no photo", async () => {
    const dir = await event();
    await jpeg(dir, "a.jpg");
    const draft = good();
    draft.photos[0]!.id = "A 1";
    const problems = draftProblems(draft, dir).join("\n");
    expect(problems).toMatch(/\bid\b/);
    expect(problems).toMatch(/coverPhotoId/);
  });
});

describe("toEvent", () => {
  const rendered = new Map([
    ["01", { width: 4, height: 3, placeholder: "data:image/jpeg;base64,AA" }],
  ]);

  it("toEvent output leaves out the file name", () => {
    const draft: Draft = {
      title: "T", date: "2026-01-01", coverPhotoId: "01",
      photos: [{ file: "_DSF0011.JPG", id: "01", alt: "A", tags: [], exif: {} }],
    };
    const out = toEvent("trip", draft, rendered);
    expect(out.slug).toBe("trip");
    expect(out.photos[0]).toMatchObject({ id: "01", width: 4, height: 3 });
    expect(JSON.stringify(out)).not.toContain("_DSF0011");
  });

  it("throws when a photo has no rendered data", () => {
    const draft: Draft = {
      title: "T", date: "2026-01-01", coverPhotoId: "01",
      photos: [{ file: "a.jpg", id: "01", alt: "A", tags: [], exif: {} }],
    };
    expect(() => toEvent("trip", draft, new Map())).toThrow(/01/);
  });
});
