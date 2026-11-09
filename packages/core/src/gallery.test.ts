import { describe, expect, it } from "vitest";
import { getAdjacentPhotos, getCover, getPhotosByTag, getTags, sortEvents } from "./gallery";
import type { Event, Photo } from "./schema";

const photo = (id: string, tags: string[] = []): Photo => ({
  id,
  width: 3,
  height: 2,
  alt: id,
  tags,
  placeholder: "data:image/webp;base64,AAAA",
  exif: {},
});

const older: Event = {
  slug: "older",
  title: "Older",
  date: "2026-01-01",
  coverPhotoId: "b",
  photos: [photo("a", ["nature"]), photo("b", ["street"])],
};
const newer: Event = {
  slug: "newer",
  title: "Newer",
  date: "2026-06-01",
  coverPhotoId: "x",
  photos: [photo("x", ["nature"])],
};

describe("gallery helpers", () => {
  it("sorts events newest first", () => {
    expect(sortEvents([older, newer]).map((e) => e.slug)).toEqual(["newer", "older"]);
  });

  it("does not mutate the input when sorting", () => {
    const input = [older, newer];
    sortEvents(input);
    expect(input[0]).toBe(older);
  });

  it("first photo has no prev", () => {
    const r = getAdjacentPhotos(older, "a");
    expect(r.prev).toBeUndefined();
    expect(r.next?.id).toBe("b");
    expect(r).toMatchObject({ index: 0, total: 2 });
  });

  it("last photo has no next", () => {
    const r = getAdjacentPhotos(older, "b");
    expect(r.prev?.id).toBe("a");
    expect(r.next).toBeUndefined();
  });

  it("follows the display order across a mirrored row", () => {
    const shaped = (id: string, width: number, height: number) => ({ ...photo(id), width, height });
    const event = {
      ...older,
      photos: [shaped("a", 3, 2), shaped("b", 2, 3), shaped("c", 3, 2), shaped("d", 2, 3)],
    };
    expect(getAdjacentPhotos(event, "b").next?.id).toBe("d");
    expect(getAdjacentPhotos(event, "c").next).toBeUndefined();
  });

  it("one photo has neither", () => {
    const r = getAdjacentPhotos(newer, "x");
    expect(r.prev).toBeUndefined();
    expect(r.next).toBeUndefined();
  });

  it("throws for an unknown photo", () => {
    expect(() => getAdjacentPhotos(newer, "nope")).toThrow(/nope/);
  });

  it("finds the cover", () => expect(getCover(older).id).toBe("b"));

  it("counts tags across events A to Z", () => {
    expect(getTags([older, newer])).toEqual([
      { tag: "nature", count: 2 },
      { tag: "street", count: 1 },
    ]);
  });

  it("lists tagged photos across events, newest first", () => {
    const found = getPhotosByTag([older, newer], "nature");
    expect(found.map((f) => `${f.event.slug}/${f.photo.id}`)).toEqual(["newer/x", "older/a"]);
  });
});
