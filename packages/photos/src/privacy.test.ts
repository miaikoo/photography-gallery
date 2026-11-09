import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { closeExif, readGroupedTags } from "./exif";
import { byteProblems, checkPrivacy, classifyTag, readerProblems } from "./privacy";
import { runEvent } from "./publish";
import { tempDir, writeTestTags } from "./test-utils";

afterAll(closeExif);

const pixels = () => sharp({ create: { width: 40, height: 30, channels: 3, background: "#789" } });

async function site() {
  const root = await tempDir();
  const photosDir = join(root, "photos");
  const contentRoot = join(root, "content");
  await mkdir(join(photosDir, "trip"), { recursive: true });
  await mkdir(join(contentRoot, "events"), { recursive: true });
  return { root, photosDir, contentRoot, repoRoot: root, file: (name: string) => join(photosDir, "trip", name) };
}

const hasGroup = (tags: Record<string, unknown>, group: string) =>
  Object.keys(tags).some((key) => key.startsWith(group.includes(":") ? group : `${group}:`));

type Make = (file: string) => Promise<void>;
type Format = "avif" | "webp";
const avif = () => pixels().avif({ effort: 0 });
const encode = (image: ReturnType<typeof pixels>, format: Format) => (format === "avif" ? image.avif({ effort: 0 }) : image.webp());
const exifIn = (format: Format, tags: Record<string, string>): Make => async (f) => {
  await encode(pixels().withExif({ IFD0: tags }), format).toFile(f);
};
const tagged = (format: Format, tags: Record<string, unknown>): Make => async (f) => {
  await encode(pixels(), format).toFile(f);
  await writeTestTags(f, tags);
};

describe("checkPrivacy", () => {
  it("passes on an empty site", async () => {
    const s = await site();
    expect(await checkPrivacy(s)).toEqual([]);
  });

  it("passes on files the pipeline made", async () => {
    const s = await site();
    const source = join(s.root, "source", "trip");
    await mkdir(source, { recursive: true });
    await sharp({ create: { width: 400, height: 300, channels: 3, background: "#789" } }).jpeg().toFile(join(source, "a.jpg"));
    await writeTestTags(join(source, "a.jpg"), { GPSLatitude: 1.5, GPSLongitude: 2.5, Artist: "Someone", Make: "Cam" });
    const paths = { contentDir: join(s.contentRoot, "events"), photosDir: s.photosDir };
    await runEvent(source, paths);
    const draftFile = join(source, "event.json");
    const draft = JSON.parse(await readFile(draftFile, "utf8"));
    draft.title = "Trip";
    draft.date = "2026-01-02";
    for (const p of draft.photos) p.alt = "alt";
    await writeFile(draftFile, JSON.stringify(draft));
    expect((await runEvent(source, paths)).status).toBe("published");
    expect(await checkPrivacy(s)).toEqual([]);
  });

  describe("fails on an image with metadata", () => {
    const gps = { GPSLatitude: 3, GPSLatitudeRef: "N", GPSLongitude: 4, GPSLongitudeRef: "E" };
    const cases: [string, Format, Make, string, string][] = [
      ["EXIF in AVIF", "avif", exifIn("avif", { Copyright: "me" }), "EXIF", "has EXIF:Copyright"],
      ["EXIF in WebP", "webp", exifIn("webp", { Copyright: "me" }), "EXIF", "has EXIF:Copyright"],
      ["EXIF in AVIF without a risky name", "avif", exifIn("avif", { Make: "Cam" }), "EXIF", "has EXIF:Make"],
      ["EXIF in WebP without a risky name", "webp", exifIn("webp", { Make: "Cam" }), "EXIF", "has EXIF:Make"],
      ["XMP in WebP", "webp", tagged("webp", { "XMP-dc:Creator": "me" }), "XMP", "has XMP:Creator"],
      ["XMP in WebP without a risky name", "webp", tagged("webp", { "XMP-dc:Title": "t" }), "XMP", "has XMP:Title"],
      ["GPS in WebP", "webp", tagged("webp", gps), "EXIF:GPSLatitude", "has EXIF:GPSLatitude"],
      ["XMP in AVIF", "avif", tagged("avif", { "XMP-dc:Creator": "me" }), "XMP", "has XMP:Creator"],
    ];
    for (const [name, ext, make, group, expected] of cases) {
      it(name, async () => {
        const s = await site();
        const file = s.file(`bad.${ext}`);
        await make(file);
        expect(hasGroup(await readGroupedTags(file), group)).toBe(true);
        const problems = await checkPrivacy(s);
        expect(problems.length).toBeGreaterThan(0);
        expect(problems.every((p) => p.includes(`bad.${ext}`))).toBe(true);
        expect(problems.some((p) => p.includes(expected))).toBe(true);
      });
    }

    it("flags the EXIF chunk of a WebP even without Exif header bytes", async () => {
      const s = await site();
      const file = s.file("chunk.webp");
      await tagged("webp", { Make: "Cam" })(file);
      expect((await readFile(file)).includes("Exif\0\0", 0, "latin1")).toBe(false);
      expect((await checkPrivacy(s)).some((p) => p.includes('has a "EXIF" chunk'))).toBe(true);
    });

    it("catches the byte signature even when the tag reader would not", async () => {
      const s = await site();
      const file = s.file("raw.webp");
      await pixels().webp().toFile(file);
      const bytes = await readFile(file);
      await writeFile(file, Buffer.concat([bytes, Buffer.from("<x:xmpmeta>")]));
      expect((await checkPrivacy(s)).some((p) => p.includes("raw.webp"))).toBe(true);
    });

    it("scans leftover temp folders", async () => {
      const s = await site();
      await mkdir(join(s.photosDir, ".tmp-trip"), { recursive: true });
      const file = join(s.photosDir, ".tmp-trip", "bad.webp");
      await exifIn("webp", { Copyright: "me" })(file);
      expect(hasGroup(await readGroupedTags(file), "EXIF")).toBe(true);
      expect((await checkPrivacy(s)).some((p) => p.includes(".tmp-trip"))).toBe(true);
    });
  });

  describe("fails on corrupt or disguised files", () => {
    const good = async () => {
      const dir = await tempDir();
      const file = join(dir, "g.webp");
      await tagged("webp", { GPSLatitude: 3, GPSLatitudeRef: "N" })(file);
      return readFile(file);
    };
    const cases: [string, string, () => Promise<Buffer>][] = [
      ["half-truncated WebP", "a.webp", async () => (await good()).subarray(0, 60)],
      ["header-only WebP", "a.webp", async () => (await good()).subarray(0, 12)],
      ["one byte cut off a WebP", "a.webp", async () => (await good()).subarray(0, -1)],
      ["0-byte WebP", "a.webp", async () => Buffer.alloc(0)],
      ["0-byte AVIF", "a.avif", async () => Buffer.alloc(0)],
      ["text named .webp", "a.webp", async () => Buffer.from("hello")],
      ["text named .avif", "a.avif", async () => Buffer.from("hello")],
      ["JPEG named .webp", "a.webp", () => pixels().jpeg().toBuffer()],
      ["PNG named .avif", "a.avif", () => pixels().png().toBuffer()],
      ["AVIF cut to ftyp only", "a.avif", async () => (await avif().toBuffer()).subarray(0, 28)],
      ["AVIF cut before mdat", "a.avif", async () => {
        const bytes = await avif().toBuffer();
        return bytes.subarray(0, bytes.indexOf("mdat", 0, "latin1") - 4);
      }],
      ["half-truncated AVIF", "a.avif", async () => (await avif().toBuffer()).subarray(0, 100)],
      [
        "WebP with a corrupted chunk size",
        "a.webp",
        async () => {
          const bytes = Buffer.from(await good());
          bytes.writeUInt32LE(0xffffff, bytes.indexOf("VP8 ", 0, "latin1") + 4);
          return bytes;
        },
      ],
    ];
    for (const [name, file, make] of cases) {
      it(name, async () => {
        const s = await site();
        await writeFile(s.file(file), await make());
        const problems = await checkPrivacy(s);
        expect(problems.length).toBeGreaterThan(0);
        expect(problems.every((p) => p.includes(file))).toBe(true);
      });
    }
  });

  it("flags a WebP whose VP8 chunk swallows the EXIF chunk", async () => {
    const s = await site();
    const file = s.file("swallow.webp");
    await tagged("webp", { GPSLatitude: 3, GPSLatitudeRef: "N" })(file);
    const bytes = Buffer.from(await readFile(file));
    const at = bytes.indexOf("VP8 ", 0, "latin1");
    bytes.writeUInt32LE(bytes.length - (at + 8), at + 4);
    await writeFile(file, bytes);
    expect(hasGroup(await readGroupedTags(file), "EXIF")).toBe(false);
    await sharp(file).raw().toBuffer();
    const problems = await checkPrivacy(s);
    expect(problems).toContain("trip/swallow.webp: declares EXIF data in its VP8X flags");
  });

  describe("classifyTag", () => {
    it("flags risky groups whatever the tag is called", () => {
      for (const key of ["EXIF:Make", "XMP:Title", "IPTC:Keywords", "GPS:Altitude", "MakerNotes:Foo", "Photoshop:Bar"]) {
        expect(classifyTag(key), key).toBe(`has ${key}`);
      }
    });

    it("flags risky names in any group", () => {
      for (const key of ["Composite:GPSPosition", "File:SerialNumber", "QuickTime:OwnerName", "RIFF:Artist", "ICC:Copyright", "X:Creator"]) {
        expect(classifyTag(key), key).toBe(`has ${key}`);
      }
    });

    it("leaves structural tags alone", () => {
      const keys = ["File:MIMEType", "ExifTool:Warning", "RIFF:ImageWidth", "Composite:ImageSize", "QuickTime:ImageWidth", "System:FileName", "SourceFile"];
      for (const key of keys) expect(classifyTag(key), key).toBeUndefined();
    });
  });

  describe("readerProblems", () => {
    const clean = { "File:MIMEType": "image/webp", "RIFF:ImageWidth": 40 };

    it("passes a clean read", () => {
      expect(readerProblems(clean, "webp")).toEqual([]);
    });

    it("flags a MIME type that does not match the extension", () => {
      expect(readerProblems({ ...clean, "File:MIMEType": "image/jpeg" }, "webp")).toEqual(["is image/jpeg, not image/webp"]);
      expect(readerProblems({}, "avif")).toEqual(["is undefined, not image/avif"]);
    });

    it("flags exiftool warnings and errors", () => {
      expect(readerProblems({ ...clean, "ExifTool:Warning": "bad" }, "webp")).toEqual(['ExifTool:Warning: "bad"']);
      expect(readerProblems({ ...clean, "ExifTool:Error": "bad" }, "webp")).toEqual(['ExifTool:Error: "bad"']);
      expect(readerProblems({ ...clean, warnings: ["w"] }, "webp")).toEqual(['warnings: ["w"]']);
      expect(readerProblems({ ...clean, errors: ["e"] }, "webp")).toEqual(['errors: ["e"]']);
      expect(readerProblems({ ...clean, errors: [], warnings: [] }, "webp")).toEqual([]);
    });
  });

  describe("byteProblems", () => {
    const riff = (...chunks: [string, number, number?][]) => {
      const body = Buffer.concat(
        chunks.map(([id, size, real]) => {
          const head = Buffer.alloc(8);
          head.write(id, 0, "latin1");
          head.writeUInt32LE(size, 4);
          return Buffer.concat([head, Buffer.alloc(real ?? size + (size % 2))]);
        }),
      );
      return Buffer.concat([Buffer.from("RIFF\0\0\0\0WEBP", "latin1"), body]);
    };

    it("passes a plain WebP structure", () => {
      expect(byteProblems(riff(["VP8 ", 10]), "webp")).toEqual([]);
    });

    it("flags EXIF and XMP chunks and overruns", () => {
      expect(byteProblems(riff(["VP8 ", 4], ["EXIF", 4]), "webp")).toEqual(['has a "EXIF" chunk']);
      expect(byteProblems(riff(["XMP ", 4]), "webp")).toEqual(['has a "XMP" chunk']);
      expect(byteProblems(riff(["VP8 ", 100, 4]), "webp")).toEqual(['has a "VP8 " chunk that overruns the file']);
    });

    it("flags the Exif and XMP markers anywhere in the bytes", () => {
      const plain = riff(["VP8 ", 4]);
      expect(byteProblems(Buffer.concat([plain, Buffer.from("Exif\0\0")]), "webp")).toContain('contains "Exif" metadata bytes');
      expect(byteProblems(Buffer.concat([plain, Buffer.from("<x:xmpmeta")]), "webp")).toContain('contains "<x:xmpmeta" metadata bytes');
    });

    it("flags the EXIF and XMP flags of a VP8X chunk", () => {
      const vp8x = (flags: number) => {
        const head = Buffer.alloc(8);
        head.write("VP8X", 0, "latin1");
        head.writeUInt32LE(10, 4);
        const body = Buffer.alloc(10);
        body[0] = flags;
        return Buffer.concat([Buffer.from("RIFF\0\0\0\0WEBP", "latin1"), head, body]);
      };
      expect(byteProblems(vp8x(0x10), "webp")).toEqual([]);
      expect(byteProblems(vp8x(0x08), "webp")).toEqual(["declares EXIF data in its VP8X flags"]);
      expect(byteProblems(vp8x(0x04), "webp")).toEqual(["declares XMP data in its VP8X flags"]);
    });

    it("flags an Exif item in an AVIF", () => {
      const infe = (version: number, type: string) =>
        Buffer.concat([Buffer.from("infe"), Buffer.from([version, 0, 0, 0]), Buffer.alloc((version === 3 ? 4 : 2) + 2), Buffer.from(type)]);
      expect(byteProblems(infe(2, "Exif"), "avif")).toEqual(["has an Exif item"]);
      expect(byteProblems(infe(3, "Exif"), "avif")).toEqual(["has an Exif item"]);
      expect(byteProblems(infe(2, "av01"), "avif")).toEqual([]);
    });
  });

  it("fails on a JPEG carrying IPTC", async () => {
    const s = await site();
    const file = s.file("iptc.jpg");
    await pixels().jpeg().toFile(file);
    await writeTestTags(file, { "IPTC:Keywords": "k" });
    expect(hasGroup(await readGroupedTags(file), "IPTC")).toBe(true);
    expect((await checkPrivacy(s)).some((p) => p.includes("iptc.jpg"))).toBe(true);
  });

  it("fails on a stray JPEG", async () => {
    const s = await site();
    await pixels().jpeg().toFile(s.file("stray.jpg"));
    const problems = await checkPrivacy(s);
    expect(problems.some((p) => p.includes("stray.jpg"))).toBe(true);
  });

  it("accepts only an exact .gitkeep name", async () => {
    const s = await site();
    await writeFile(join(s.photosDir, ".gitkeep"), "");
    expect(await checkPrivacy(s)).toEqual([]);
    await writeFile(join(s.photosDir, "evil.gitkeep"), "secret");
    expect((await checkPrivacy(s)).some((p) => p.includes("evil.gitkeep"))).toBe(true);
  });

  it("fails on a gps key at any depth in content JSON", async () => {
    for (const key of ["gps", "GPSLatitude", "latitude", "longitude"]) {
      const s = await site();
      await writeFile(join(s.contentRoot, "events", "x.json"), JSON.stringify({ photos: [{ deep: [{ [key]: 1 }] }] }));
      const problems = await checkPrivacy(s);
      expect(problems.some((p) => p.includes("x.json") && p.includes(key))).toBe(true);
    }
  });

  it("reads content/fixtures and content/empty as well as events", async () => {
    const s = await site();
    for (const dir of [join("fixtures", "events"), "empty"]) {
      await mkdir(join(s.contentRoot, dir), { recursive: true });
      await writeFile(join(s.contentRoot, dir, "leak.json"), JSON.stringify({ latitude: 1 }));
    }
    const problems = await checkPrivacy(s);
    expect(problems.some((p) => p.includes("fixtures") && p.includes("leak.json"))).toBe(true);
    expect(problems.some((p) => p.includes("empty") && p.includes("leak.json"))).toBe(true);
  });

  it("fails when a file under originals is tracked by git", async () => {
    const s = await site();
    execFileSync("git", ["init", "-q"], { cwd: s.root });
    await mkdir(join(s.root, "originals", "trip"), { recursive: true });
    await writeFile(join(s.root, "originals", "trip", "a.jpg"), "x");
    execFileSync("git", ["add", "-f", "originals/trip/a.jpg"], { cwd: s.root });
    const problems = await checkPrivacy(s);
    expect(problems.some((p) => p.includes("originals/trip/a.jpg"))).toBe(true);
  });

  describe("fails on photo and draft files anywhere in the repo", () => {
    const names = ["shots/a.jpg", "A.JPEG", "raw/b.RAF", "raw/c.cr2", "d.cr3", "e.nef", "f.arw", "g.dng", "h.orf", "i.rw2", "j.heic", "k.tif", "l.TIFF", "docs/event.json", "x/.photos-cache.json"];
    for (const name of names) {
      it(`staged but not committed: ${name}`, async () => {
        const s = await site();
        execFileSync("git", ["init", "-q"], { cwd: s.root });
        await mkdir(join(s.root, name, ".."), { recursive: true });
        await writeFile(join(s.root, name), "x");
        execFileSync("git", ["add", name], { cwd: s.root });
        const problems = await checkPrivacy(s);
        expect(problems.some((p) => p.includes(name))).toBe(true);
      });
    }

    it("fails on a committed photo too", async () => {
      const s = await site();
      execFileSync("git", ["init", "-q"], { cwd: s.root });
      await writeFile(join(s.root, "a.jpg"), "x");
      execFileSync("git", ["add", "a.jpg"], { cwd: s.root });
      execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "x"], { cwd: s.root });
      expect((await checkPrivacy(s)).some((p) => p.includes("a.jpg"))).toBe(true);
    });

    it("passes on staged files that aren't photos or drafts", async () => {
      const s = await site();
      execFileSync("git", ["init", "-q"], { cwd: s.root });
      await writeFile(join(s.root, "README.md"), "x");
      await writeFile(join(s.root, "logo.png"), "x");
      await writeFile(join(s.root, "event.json.md"), "x");
      execFileSync("git", ["add", "README.md", "logo.png", "event.json.md"], { cwd: s.root });
      expect(await checkPrivacy(s)).toEqual([]);
    });
  });

  it("passes the git check when originals are untracked", async () => {
    const s = await site();
    execFileSync("git", ["init", "-q"], { cwd: s.root });
    await mkdir(join(s.root, "originals"), { recursive: true });
    await writeFile(join(s.root, "originals", "a.jpg"), "x");
    expect(await checkPrivacy(s)).toEqual([]);
  });

  it("skips the git check outside a repo", async () => {
    const s = await site();
    await mkdir(join(s.root, "originals"), { recursive: true });
    await writeFile(join(s.root, "originals", "a.jpg"), "x");
    expect(await checkPrivacy(s)).toEqual([]);
  });

  describe("git failures", () => {
    it("reports a corrupt index instead of passing", async () => {
      const s = await site();
      execFileSync("git", ["init", "-q"], { cwd: s.root });
      await mkdir(join(s.root, "originals"), { recursive: true });
      await writeFile(join(s.root, "originals", "a.jpg"), "x");
      execFileSync("git", ["add", "-f", "originals/a.jpg"], { cwd: s.root });
      await writeFile(join(s.root, ".git", "index"), "garbage garbage garbage");
      const problems = await checkPrivacy(s);
      expect(problems.some((p) => p.startsWith("git check failed"))).toBe(true);
    });

    it("reports a repo owned by someone else instead of passing", async () => {
      const s = await site();
      execFileSync("git", ["init", "-q"], { cwd: s.root });
      process.env.GIT_TEST_ASSUME_DIFFERENT_OWNER = "1";
      try {
        const problems = await checkPrivacy(s);
        expect(problems.some((p) => p.startsWith("git check failed"))).toBe(true);
      } finally {
        delete process.env.GIT_TEST_ASSUME_DIFFERENT_OWNER;
      }
    });

    it("reports a bare repo, which has no work tree", async () => {
      const s = await site();
      execFileSync("git", ["init", "-q", "--bare", join(s.root, "bare.git")], { cwd: s.root });
      const problems = await checkPrivacy({ ...s, repoRoot: join(s.root, "bare.git") });
      expect(problems.some((p) => p.startsWith("git check failed"))).toBe(true);
    });

    it("reports a repoRoot inside .git", async () => {
      const s = await site();
      execFileSync("git", ["init", "-q"], { cwd: s.root });
      const problems = await checkPrivacy({ ...s, repoRoot: join(s.root, ".git") });
      expect(problems.some((p) => p.startsWith("git check failed"))).toBe(true);
    });

    it("reports a repo with core.bare=true and a tracked original", async () => {
      const s = await site();
      execFileSync("git", ["init", "-q"], { cwd: s.root });
      await mkdir(join(s.root, "originals"), { recursive: true });
      await writeFile(join(s.root, "originals", "a.jpg"), "x");
      execFileSync("git", ["add", "-f", "originals/a.jpg"], { cwd: s.root });
      execFileSync("git", ["config", "core.bare", "true"], { cwd: s.root });
      const problems = await checkPrivacy(s);
      expect(problems.some((p) => p.startsWith("git check failed"))).toBe(true);
    });

    it("reports a repo root that does not exist", async () => {
      const s = await site();
      const problems = await checkPrivacy({ ...s, repoRoot: join(s.root, "missing") });
      expect(problems.some((p) => p.startsWith("git check failed"))).toBe(true);
    });
  });
});
