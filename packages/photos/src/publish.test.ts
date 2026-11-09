import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { eventSchema } from "@gallery/core";
import sharp from "sharp";
import { afterAll, describe, expect, it, onTestFinished, vi } from "vitest";
import { closeExif } from "./exif";
import { RENDER_SETTINGS } from "./render";
import { runEvent, slugFromFolder, swapWithRetry, type Paths } from "./publish";
import { tempDir } from "./test-utils";

afterAll(closeExif);

async function jpeg(file: string, shade = "#888") {
  await sharp({ create: { width: 100, height: 80, channels: 3, background: shade } })
    .jpeg()
    .toFile(file);
}

type Setup = { source: string; paths: Paths; json: string; folder: string };

async function setup(names: string[] = ["a.jpg", "b.jpg"]): Promise<Setup> {
  const root = await tempDir();
  const source = join(root, "Source", "bromo-trip");
  await mkdir(source, { recursive: true });
  for (const [i, name] of names.entries()) await jpeg(join(source, name), i % 2 ? "#468" : "#864");
  const paths = { contentDir: join(root, "content", "events"), photosDir: join(root, "photos") };
  await mkdir(paths.photosDir, { recursive: true });
  return {
    source,
    paths,
    json: join(paths.contentDir, "bromo-trip.json"),
    folder: join(paths.photosDir, "bromo-trip"),
  };
}

async function edit(source: string, change: (draft: any) => void) {
  const file = join(source, "event.json");
  const draft = JSON.parse(await readFile(file, "utf8"));
  change(draft);
  await writeFile(file, JSON.stringify(draft, null, 2));
}

const complete = (source: string) =>
  edit(source, (d) => {
    d.title = "Bromo";
    d.date = "2026-01-02";
    for (const p of d.photos) p.alt = `alt ${p.id}`;
  });

async function published(names?: string[]) {
  const s = await setup(names);
  await runEvent(s.source, s.paths);
  await complete(s.source);
  const result = await runEvent(s.source, s.paths);
  return { ...s, result };
}

const sha = async (file: string) => createHash("sha256").update(await readFile(file)).digest("hex");
const leftovers = (dir: string) => readdirSync(dir).filter((n) => n.startsWith("."));

describe("runEvent", () => {
  it("first run creates the draft and publishes nothing", async () => {
    const s = await setup();
    const result = await runEvent(s.source, s.paths);
    expect(result).toMatchObject({ status: "draft-created", rendered: 0, reused: 0 });
    expect(existsSync(join(s.source, "event.json"))).toBe(true);
    expect(existsSync(s.json)).toBe(false);
    expect(existsSync(s.folder)).toBe(false);
  });

  it("a run with empty alt text returns needs-edits and lists each one", async () => {
    const s = await setup();
    await runEvent(s.source, s.paths);
    const result = await runEvent(s.source, s.paths);
    expect(result.status).toBe("needs-edits");
    expect(result.messages.filter((m) => m.includes("alt: is empty"))).toHaveLength(2);
    expect(existsSync(s.json)).toBe(false);
  });

  it("a run after adding a photo returns draft-updated and publishes nothing", async () => {
    const s = await setup();
    await runEvent(s.source, s.paths);
    await jpeg(join(s.source, "c.jpg"));
    const result = await runEvent(s.source, s.paths);
    expect(result.status).toBe("draft-updated");
    expect(existsSync(s.json)).toBe(false);
  });

  it("the draft-updated message says how to drop a photo", async () => {
    const s = await setup();
    await runEvent(s.source, s.paths);
    await jpeg(join(s.source, "c.jpg"));
    const text = (await runEvent(s.source, s.paths)).messages.join(" ");
    expect(text).toContain("Added c.jpg");
    expect(text).toMatch(/move its file out of the folder and delete its entry/);
  });

  it("a complete draft publishes files that loadEvents accepts", async () => {
    const s = await published();
    expect(s.result).toMatchObject({ status: "published", rendered: 2, reused: 0 });
    const event = eventSchema.parse(JSON.parse(await readFile(s.json, "utf8")));
    expect(event.slug).toBe("bromo-trip");
    expect(event.photos).toHaveLength(2);
    for (const photo of event.photos) {
      for (const ext of ["avif", "webp"]) {
        expect(existsSync(join(s.folder, `${photo.id}-100.${ext}`))).toBe(true);
      }
    }
    expect(leftovers(s.paths.photosDir)).toEqual([]);
  });

  it("reports each photo as encoded, then as reused on a re-run", async () => {
    const s = await setup();
    await runEvent(s.source, s.paths);
    await complete(s.source);
    const first: string[] = [];
    await runEvent(s.source, s.paths, (file, status) => first.push(`${file} ${status}`));
    expect(first).toEqual(["a.jpg encoded", "b.jpg encoded"]);
    const again: string[] = [];
    await runEvent(s.source, s.paths, (file, status) => again.push(`${file} ${status}`));
    expect(again).toEqual(["a.jpg reused", "b.jpg reused"]);
  });

  it("reorders photos in the JSON without changing ids or files", async () => {
    const s = await published();
    const before = readdirSync(s.folder).sort();
    await edit(s.source, (d) => d.photos.reverse());
    const result = await runEvent(s.source, s.paths);
    expect(result).toMatchObject({ status: "published", rendered: 0, reused: 2 });
    const event = JSON.parse(await readFile(s.json, "utf8"));
    expect(event.photos.map((p: any) => p.id)).toEqual(["02", "01"]);
    expect(readdirSync(s.folder).sort()).toEqual(before);
  });

  it("removes files of a photo taken out of the draft", async () => {
    const s = await published();
    await rm(join(s.source, "b.jpg"));
    await edit(s.source, (d) => (d.photos = d.photos.filter((p: any) => p.file !== "b.jpg")));
    const result = await runEvent(s.source, s.paths);
    expect(result).toMatchObject({ status: "published", rendered: 0, reused: 1 });
    expect(readdirSync(s.folder).sort()).toEqual(["01-100.avif", "01-100.webp"]);
    expect(JSON.parse(await readFile(s.json, "utf8")).photos).toHaveLength(1);
  });

  it("a second run re-encodes nothing", async () => {
    const s = await published();
    const first = await readFile(s.json, "utf8");
    const result = await runEvent(s.source, s.paths);
    expect(result).toMatchObject({ status: "published", rendered: 0, reused: 2 });
    expect(await readFile(s.json, "utf8")).toBe(first);
  });

  it("a replaced source file is re-encoded", async () => {
    const s = await published();
    await jpeg(join(s.source, "a.jpg"), "#0a0");
    const result = await runEvent(s.source, s.paths);
    expect(result).toMatchObject({ rendered: 1, reused: 1 });
  });

  it("a changed watermark shadow setting re-encodes every photo", async () => {
    const s = await published();
    const before = RENDER_SETTINGS.watermark.shadowBase;
    onTestFinished(() => {
      RENDER_SETTINGS.watermark.shadowBase = before;
    });
    RENDER_SETTINGS.watermark.shadowBase = before + 0.1;
    expect(await runEvent(s.source, s.paths)).toMatchObject({ rendered: 2, reused: 0 });
    expect(await runEvent(s.source, s.paths)).toMatchObject({ rendered: 0, reused: 2 });
  });

  it("a missing published file is re-encoded", async () => {
    const s = await published();
    await rm(join(s.folder, "02-100.webp"));
    const result = await runEvent(s.source, s.paths);
    expect(result).toMatchObject({ rendered: 1, reused: 1 });
    expect(existsSync(join(s.folder, "02-100.webp"))).toBe(true);
  });

  it("a leftover folder that can't be deleted after a publish is named, not reported as a failure", async () => {
    const s = await published();
    await jpeg(join(s.source, "a.jpg"), "#0a0");
    const remove = vi.fn(async (path: Parameters<typeof rm>[0], options?: Parameters<typeof rm>[1]) => {
      if (String(path).endsWith(".old-bromo-trip")) throw Object.assign(new Error("EBUSY: resource busy"), { code: "EBUSY" });
      return rm(path, options);
    });
    const result = await runEvent(s.source, s.paths, undefined, remove);
    expect(result.status).toBe("published");
    expect(result.messages.some((m) => m.includes(".old-bromo-trip") && m.includes("EBUSY"))).toBe(true);
    expect(eventSchema.parse(JSON.parse(await readFile(s.json, "utf8"))).photos).toHaveLength(2);
    expect(remove).toHaveBeenCalledWith(expect.stringContaining(".old-bromo-trip"), expect.objectContaining({ maxRetries: 5, retryDelay: 300 }));
  });

  it("a corrupt photo fails and leaves the previous event untouched", async () => {
    const s = await published();
    const json = await readFile(s.json, "utf8");
    const files = readdirSync(s.folder).sort();
    await writeFile(join(s.source, "c.jpg"), Buffer.from("not a jpeg at all"));
    await runEvent(s.source, s.paths);
    await edit(s.source, (d) => (d.photos.at(-1).alt = "broken"));
    await expect(runEvent(s.source, s.paths)).rejects.toThrow(/c\.jpg/);
    expect(await readFile(s.json, "utf8")).toBe(json);
    expect(readdirSync(s.folder).sort()).toEqual(files);
    expect(leftovers(s.paths.photosDir)).toEqual([]);
  });

  it("names photos without camera data when creating and updating the draft", async () => {
    const s = await setup();
    const created = await runEvent(s.source, s.paths);
    expect(created.messages.join(" ")).toMatch(/a\.jpg/);
    await jpeg(join(s.source, "c.jpg"));
    const updated = await runEvent(s.source, s.paths);
    expect(updated.messages.join(" ")).toMatch(/c\.jpg/);
  });

  it("names photos published with fewer widths", async () => {
    const s = await published();
    expect(s.result.messages.join(" ")).toMatch(/fewer.*a\.jpg/);
  });

  it("clears a temp folder left by a crashed run", async () => {
    const s = await setup();
    await runEvent(s.source, s.paths);
    await complete(s.source);
    const stale = join(s.paths.photosDir, ".tmp-bromo-trip");
    await mkdir(stale, { recursive: true });
    await writeFile(join(stale, "stale.txt"), "x");
    await runEvent(s.source, s.paths);
    expect(leftovers(s.paths.photosDir)).toEqual([]);
    expect(existsSync(join(s.folder, "stale.txt"))).toBe(false);
  });

  it("an unsupported file fails with its name and publishes nothing", async () => {
    const s = await setup();
    await writeFile(join(s.source, "clip.mov"), "x");
    await expect(runEvent(s.source, s.paths)).rejects.toThrow(/clip\.mov/);
    expect(existsSync(s.json)).toBe(false);
    expect(existsSync(s.folder)).toBe(false);
  });

  it("keeps originals byte for byte", async () => {
    const s = await setup();
    const before = [await sha(join(s.source, "a.jpg")), await sha(join(s.source, "b.jpg"))];
    await runEvent(s.source, s.paths);
    await complete(s.source);
    await runEvent(s.source, s.paths);
    expect([await sha(join(s.source, "a.jpg")), await sha(join(s.source, "b.jpg"))]).toEqual(before);
  });
});

describe("slugFromFolder", () => {
  it("accepts trailing slashes and backslashes", () => {
    expect(slugFromFolder("C:\\Photos\\bromo-trip\\")).toBe("bromo-trip");
    expect(slugFromFolder("/photos/bromo-trip/")).toBe("bromo-trip");
  });

  it("suggests a valid slug for a bad folder name", () => {
    expect(() => slugFromFolder("/photos/Bromo Trip")).toThrow(/bromo-trip/);
  });
});

describe("swapWithRetry", () => {
  const fail = (code: string) => Object.assign(new Error(code), { code });

  it("retries EPERM and EBUSY, then succeeds", async () => {
    let calls = 0;
    const rename = async () => {
      calls++;
      if (calls === 1) throw fail("EPERM");
      if (calls === 2) throw fail("EBUSY");
    };
    await swapWithRetry("a", "b", rename as any);
    expect(calls).toBe(3);
  });

  it("rethrows after its attempts, keeping the old folder", async () => {
    const root = await tempDir();
    await mkdir(join(root, "old"));
    let calls = 0;
    const rename = async () => {
      calls++;
      throw fail("EPERM");
    };
    await expect(swapWithRetry(join(root, "new"), join(root, "old"), rename as any)).rejects.toThrow("EPERM");
    expect(calls).toBe(5);
    expect(existsSync(join(root, "old"))).toBe(true);
  });
});
