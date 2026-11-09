import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runEvent = vi.hoisted(() => vi.fn());
const checkPrivacy = vi.hoisted(() => vi.fn());
const closeExif = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("./publish", () => ({ runEvent }));
vi.mock("./privacy", () => ({ checkPrivacy }));
vi.mock("./exif", () => ({ closeExif }));

import { main } from "./cli";
import { tempDir } from "./test-utils";

const result = (status: string, messages: string[] = []) => ({ status, messages, rendered: 0, reused: 0 });

async function run(argv: string[], repoRoot: string) {
  const lines: string[] = [];
  const code = await main(argv, repoRoot, (line) => lines.push(line));
  return { code, lines, text: lines.join("\n") };
}

beforeEach(() => {
  runEvent.mockReset();
  checkPrivacy.mockReset();
  closeExif.mockClear();
});

describe("photos command", () => {
  it("with no folder prints usage and returns 1", async () => {
    const { code, text } = await run(["photos"], await tempDir());
    expect(code).toBe(1);
    expect(text).toContain("Usage: pnpm photos <folder>");
    expect(runEvent).not.toHaveBeenCalled();
  });

  it("on a missing folder names it and returns 1", async () => {
    const { code, text } = await run(["photos", "originals/nope"], await tempDir());
    expect(code).toBe(1);
    expect(text).toContain("originals/nope");
    expect(runEvent).not.toHaveBeenCalled();
  });

  it("accepts a relative path with a trailing slash", async () => {
    const root = await tempDir();
    await mkdir(join(root, "originals", "bromo-trip"), { recursive: true });
    runEvent.mockResolvedValue(result("published", ["Published bromo-trip: 1 encoded, 0 reused"]));
    const { code, text } = await run(["photos", "originals/bromo-trip/"], root);
    expect(code).toBe(0);
    expect(runEvent).toHaveBeenCalledWith(
      resolve(root, "originals/bromo-trip/"),
      {
        contentDir: join(root, "content", "events"),
        photosDir: join(root, "apps", "web", "public", "photos"),
      },
      expect.any(Function),
    );
    expect(text).toContain("Published bromo-trip");
  });

  it("refuses a folder in the repo that git doesn't ignore, naming it", async () => {
    const root = await tempDir();
    execFileSync("git", ["init", "-q"], { cwd: root });
    await mkdir(join(root, "Pictures", "trip"), { recursive: true });
    const { code, text } = await run(["photos", "Pictures/trip"], root);
    expect(code).toBe(1);
    expect(text).toContain(join(root, "Pictures", "trip"));
    expect(text).toContain("originals/");
    expect(runEvent).not.toHaveBeenCalled();
  });

  it("logs a line for each photo as it finishes", async () => {
    const root = await tempDir();
    await mkdir(join(root, "originals", "bromo-trip"), { recursive: true });
    runEvent.mockImplementation(async (_dir, _paths, onPhoto) => {
      onPhoto("_DSF0011.JPG", "encoded");
      onPhoto("_DSF0061.JPG", "reused");
      return result("published", ["Published bromo-trip: 1 encoded, 1 reused"]);
    });
    const { lines } = await run(["photos", "originals/bromo-trip"], root);
    expect(lines.slice(0, 2)).toEqual(["_DSF0011.JPG encoded", "_DSF0061.JPG reused"]);
  });

  it.each(["draft-created", "draft-updated", "needs-edits"])(
    "%s prints what to do next and returns 0",
    async (status) => {
      const root = await tempDir();
      await mkdir(join(root, "originals", "bromo-trip"), { recursive: true });
      runEvent.mockResolvedValue(result(status, ["Something to fix"]));
      const { code, text } = await run(["photos", "originals/bromo-trip"], root);
      expect(code).toBe(0);
      expect(text).toContain("Something to fix");
      expect(text).toContain("originals");
      expect(text).toContain("event.json");
      expect(text).toContain("pnpm photos originals/bromo-trip");
    },
  );
});

describe("privacy command", () => {
  it("returns 1 and prints each problem", async () => {
    checkPrivacy.mockResolvedValue(["a/b.webp: has EXIF:Make", "content/x.json: has gps"]);
    const root = await tempDir();
    const { code, lines } = await run(["privacy"], root);
    expect(code).toBe(1);
    expect(lines).toContain("a/b.webp: has EXIF:Make");
    expect(lines).toContain("content/x.json: has gps");
    expect(checkPrivacy).toHaveBeenCalledWith({
      photosDir: join(root, "apps", "web", "public", "photos"),
      contentRoot: join(root, "content"),
      repoRoot: root,
    });
  });

  it("returns 0 when clean", async () => {
    checkPrivacy.mockResolvedValue([]);
    const { code, text } = await run(["privacy"], await tempDir());
    expect(code).toBe(0);
    expect(text).toContain("clean");
  });
});

describe("main", () => {
  it("always closes exiftool, including after an error", async () => {
    const root = await tempDir();
    await mkdir(join(root, "originals", "bromo-trip"), { recursive: true });
    runEvent.mockRejectedValue(new Error("Could not process a.jpg: broken"));
    const { code, text } = await run(["photos", "originals/bromo-trip"], root);
    expect(code).toBe(1);
    expect(text).toContain("Could not process a.jpg: broken");
    expect(closeExif).toHaveBeenCalledTimes(1);
  });

  it("prints usage for an unknown command and closes exiftool", async () => {
    const { code, text } = await run(["nope"], await tempDir());
    expect(code).toBe(1);
    expect(text).toContain("Usage");
    expect(closeExif).toHaveBeenCalledTimes(1);
  });
});
