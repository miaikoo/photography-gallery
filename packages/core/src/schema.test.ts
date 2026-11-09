import { describe, expect, it } from "vitest";
import { eventSchema, siteSchema, validateContent, type Event } from "./schema";

const photo = (id: string) => ({
  id,
  width: 3000,
  height: 2000,
  alt: "Misty hills at sunrise",
  tags: ["nature"],
  placeholder: "data:image/webp;base64,AAAA",
  exif: { camera: "Fujifilm X-T5", iso: 200 },
});

const event = (over: Record<string, unknown> = {}) => ({
  slug: "morning-fog",
  title: "Morning Fog",
  date: "2026-08-17",
  coverPhotoId: "01",
  photos: [photo("01")],
  ...over,
});

describe("eventSchema", () => {
  it("valid event parses", () => {
    expect(eventSchema.parse(event()).title).toBe("Morning Fog");
  });

  it("GPS in exif is rejected", () => {
    const bad = event({ photos: [{ ...photo("01"), exif: { gps: "1,1" } }] });
    expect(eventSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an unknown key on a photo", () => {
    const bad = event({ photos: [{ ...photo("01"), gps: "1,1" }] });
    expect(eventSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an unknown key on an event", () => {
    expect(eventSchema.safeParse({ ...event(), latitude: 1 }).success).toBe(false);
  });

  it("rejects an unknown key on the site", () => {
    expect(siteSchema.safeParse({ bio: "", instagramUrl: "", gps: "1,1" }).success).toBe(false);
  });

  it("empty alt is rejected", () => {
    const bad = event({ photos: [{ ...photo("01"), alt: "" }] });
    expect(eventSchema.safeParse(bad).success).toBe(false);
  });

  it("cover must match a photo", () => {
    expect(eventSchema.safeParse(event({ coverPhotoId: "99" })).success).toBe(false);
  });

  it("duplicate photo id is rejected", () => {
    expect(eventSchema.safeParse(event({ photos: [photo("01"), photo("01")] })).success).toBe(false);
  });

  it("event needs a photo", () => {
    expect(eventSchema.safeParse(event({ photos: [] })).success).toBe(false);
  });

  it("unsafe slugs and tags are rejected", () => {
    const unsafe = "Street Photo";
    expect(eventSchema.safeParse(event({ slug: unsafe })).success).toBe(false);
    expect(
      eventSchema.safeParse(event({ coverPhotoId: unsafe, photos: [photo(unsafe)] })).success,
    ).toBe(false);
    expect(
      eventSchema.safeParse(event({ photos: [{ ...photo("01"), tags: [unsafe] }] })).success,
    ).toBe(false);
  });

  it("non-ISO exif date is rejected", () => {
    const bad = event({ photos: [{ ...photo("01"), exif: { date: "17 Aug 2026" } }] });
    expect(eventSchema.safeParse(bad).success).toBe(false);
  });

  it("invalid date is rejected", () => {
    expect(eventSchema.safeParse(event({ date: "17 Aug 2026" })).success).toBe(false);
  });
});

describe("siteSchema", () => {
  it("allows blank about fields", () => {
    expect(siteSchema.parse({ bio: "", instagramUrl: "" }).bio).toBe("");
  });

  it("rejects a non-URL Instagram link", () => {
    expect(siteSchema.safeParse({ bio: "", instagramUrl: "miaikoo" }).success).toBe(false);
  });

  it.each(["javascript:alert(1)", "http://instagram.com/x", "data:text/html,x"])(
    "rejects %s as an Instagram link",
    (instagramUrl) => {
      expect(siteSchema.safeParse({ bio: "", instagramUrl }).success).toBe(false);
    },
  );

  it.each(["https://instagram.com/x", ""])("accepts %j as an Instagram link", (instagramUrl) => {
    expect(siteSchema.safeParse({ bio: "", instagramUrl }).success).toBe(true);
  });
});

describe("validateContent", () => {
  const parsed = eventSchema.parse(event()) as Event;

  it("throws naming a duplicate event slug", () => {
    expect(() => validateContent([parsed, parsed], () => true)).toThrow(/morning-fog/);
  });

  it("throws naming event/photo for a missing image", () => {
    expect(() => validateContent([parsed], () => false)).toThrow(/morning-fog\/01/);
  });

  it("accepts valid content", () => {
    expect(() => validateContent([parsed], () => true)).not.toThrow();
  });
});
