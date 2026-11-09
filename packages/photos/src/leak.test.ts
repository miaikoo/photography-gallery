import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, expect, it } from "vitest";
import { closeExif, readTags } from "./exif";
import { checkPrivacy } from "./privacy";
import { runEvent } from "./publish";
import { tempDir, writeTestTags } from "./test-utils";

afterAll(closeExif);

it("drops GPS, serial number, and owner name from everything published", async () => {
  const root = await tempDir();
  const source = join(root, "source", "leaky");
  await mkdir(source, { recursive: true });
  const file = join(source, "a.jpg");
  await sharp({ create: { width: 400, height: 300, channels: 3, background: "#468" } }).jpeg().toFile(file);
  await writeTestTags(file, {
    GPSLatitude: 51.5,
    GPSLatitudeRef: "N",
    GPSLongitude: 0.12,
    GPSLongitudeRef: "E",
    SerialNumber: "SERIAL123",
    OwnerName: "Secret Owner",
    Artist: "Secret Owner",
  });

  const before = await readTags(file);
  for (const key of ["GPSLatitude", "GPSLongitude", "SerialNumber", "OwnerName", "Artist"]) {
    expect(before[key], key).toBeDefined();
  }

  const contentRoot = join(root, "content");
  const paths = { contentDir: join(contentRoot, "events"), photosDir: join(root, "photos") };
  await mkdir(paths.photosDir, { recursive: true });
  await runEvent(source, paths);
  const draftFile = join(source, "event.json");
  const draft = JSON.parse(await readFile(draftFile, "utf8"));
  draft.title = "Leaky";
  draft.date = "2026-01-02";
  for (const p of draft.photos) p.alt = "alt";
  await writeFile(draftFile, JSON.stringify(draft));
  expect((await runEvent(source, paths)).status).toBe("published");

  const folder = join(paths.photosDir, "leaky");
  const outputs = (await readdir(folder)).map((name) => join(folder, name));
  expect(outputs.length).toBeGreaterThan(0);
  for (const out of outputs) {
    const tags = await readTags(out);
    for (const key of ["GPSLatitude", "GPSLongitude", "SerialNumber", "OwnerName", "Artist"]) {
      expect(tags[key]).toBeUndefined();
    }
    const bytes = await readFile(out);
    expect(bytes.includes("Secret Owner")).toBe(false);
    expect(bytes.includes("SERIAL123")).toBe(false);
  }
  const json = await readFile(join(paths.contentDir, "leaky.json"), "utf8");
  expect(json).not.toMatch(/gps|latitude|Secret Owner|SERIAL123/i);
  expect(await checkPrivacy({ ...paths, contentRoot, repoRoot: root })).toEqual([]);
});
