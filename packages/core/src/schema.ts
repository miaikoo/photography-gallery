import { z } from "zod";

const slug = z.string().regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers, and hyphens only");

export const photoSchema = z.strictObject({
  id: slug,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  alt: z.string().trim().min(1),
  tags: z.array(slug),
  placeholder: z.string().startsWith("data:image/"),
  // Strict on purpose: an unknown key such as GPS data must fail the build.
  exif: z.strictObject({
    date: z.iso.date().optional(),
    camera: z.string().optional(),
    lens: z.string().optional(),
    focalLength: z.string().optional(),
    aperture: z.string().optional(),
    shutter: z.string().optional(),
    iso: z.number().int().positive().optional(),
  }),
});

export const eventSchema = z
  .strictObject({
    slug,
    title: z.string().trim().min(1),
    date: z.iso.date(),
    coverPhotoId: slug,
    photos: z.array(photoSchema).min(1),
  })
  .superRefine((event, ctx) => {
    const ids = event.photos.map((photo) => photo.id);
    if (!ids.includes(event.coverPhotoId)) {
      ctx.addIssue({
        code: "custom",
        path: ["coverPhotoId"],
        message: `No photo with ID "${event.coverPhotoId}"`,
      });
    }
    for (const id of new Set(ids.filter((value, i) => ids.indexOf(value) !== i))) {
      ctx.addIssue({ code: "custom", path: ["photos"], message: `Duplicate photo ID "${id}"` });
    }
  });

export const siteSchema = z.strictObject({
  bio: z.string(),
  instagramUrl: z.union([z.literal(""), z.url({ protocol: /^https$/ })]),
});

export type Photo = z.infer<typeof photoSchema>;
export type Event = z.infer<typeof eventSchema>;
export type Site = z.infer<typeof siteSchema>;

export function validateContent(
  events: Event[],
  imageExists: (event: string, photo: string) => boolean,
): void {
  const seen = new Set<string>();
  for (const event of events) {
    if (seen.has(event.slug)) throw new Error(`Duplicate event slug "${event.slug}"`);
    seen.add(event.slug);
    for (const photo of event.photos) {
      if (!imageExists(event.slug, photo.id)) {
        throw new Error(`Missing image files for ${event.slug}/${photo.id}`);
      }
    }
  }
}
