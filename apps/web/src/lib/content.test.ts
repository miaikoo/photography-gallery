import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { loadEvents } from "./content";

const event = {
  slug: "morning-fog",
  title: "Morning Fog",
  date: "2026-08-17",
  coverPhotoId: "01",
  photos: [
    {
      id: "01",
      width: 3000,
      height: 2000,
      alt: "Misty hills",
      tags: ["nature"],
      placeholder: "data:image/webp;base64,AAAA",
      exif: {},
    },
  ],
};

describe("loadEvents", () => {
  let content: string;
  let photos: string;

  const touchImage = (name: string) => {
    mkdirSync(join(photos, "morning-fog"), { recursive: true });
    writeFileSync(join(photos, "morning-fog", name), "");
  };

  beforeEach(() => {
    const root = mkdtempSync(join(tmpdir(), "gallery-"));
    content = join(root, "events");
    photos = join(root, "photos");
    mkdirSync(content);
    mkdirSync(photos);
  });

  it("reads valid JSON and lists complete widths ascending", () => {
    writeFileSync(join(content, "morning-fog.json"), JSON.stringify(event));
    ["1600", "640"].forEach((w) => {
      touchImage(`01-${w}.avif`);
      touchImage(`01-${w}.webp`);
    });
    touchImage("01-2400.webp"); // no AVIF, so this width is incomplete

    const [loaded] = loadEvents(content, photos);
    expect(loaded?.title).toBe("Morning Fog");
    expect(loaded?.photos[0]?.widths).toEqual([640, 1600]);
  });

  it("returns nothing for an empty folder", () => {
    expect(loadEvents(content, photos)).toEqual([]);
  });

  it("ignores non-JSON files", () => {
    writeFileSync(join(content, ".gitkeep"), "");
    expect(loadEvents(content, photos)).toEqual([]);
  });

  it("throws naming the file for invalid JSON", () => {
    writeFileSync(join(content, "broken.json"), "{ nope");
    expect(() => loadEvents(content, photos)).toThrow(/broken\.json/);
  });

  it("throws naming the file for a schema failure", () => {
    writeFileSync(join(content, "bad.json"), JSON.stringify({ ...event, title: "" }));
    expect(() => loadEvents(content, photos)).toThrow(/bad\.json/);
  });

  it("throws when image files are missing", () => {
    writeFileSync(join(content, "morning-fog.json"), JSON.stringify(event));
    expect(() => loadEvents(content, photos)).toThrow(/morning-fog\/01/);
  });
});
