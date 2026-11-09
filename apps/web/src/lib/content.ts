import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { photosPath } from "./photo-url";
import {
  eventSchema,
  siteSchema,
  sortEvents,
  validateContent,
  type Event,
  type Photo,
  type Site,
} from "@gallery/core";

export type ResolvedPhoto = Photo & { widths: number[] };
export type ResolvedEvent = Omit<Event, "photos"> & { photos: ResolvedPhoto[] };

const contentFolders: Record<string, string> = { fixtures: "fixtures", empty: "empty" };
const contentRoot = () =>
  resolve(process.cwd(), "../../content", contentFolders[process.env.CONTENT_SOURCE ?? ""] ?? "");

function readWidths(photosDir: string, event: string, photo: string): number[] {
  const dir = join(photosDir, event);
  if (!existsSync(dir)) return [];
  const files = new Set(readdirSync(dir));
  const prefix = `${photo}-`;
  return [...files]
    .filter((file) => file.startsWith(prefix) && file.endsWith(".webp"))
    .map((file) => file.slice(prefix.length, -".webp".length))
    .filter((width) => /^[0-9]+$/.test(width) && files.has(`${prefix}${width}.avif`))
    .map(Number)
    .sort((a, b) => a - b);
}

export function loadEvents(contentDir: string, photosDir: string): ResolvedEvent[] {
  if (!existsSync(contentDir)) return [];
  const events = readdirSync(contentDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => {
      try {
        return eventSchema.parse(JSON.parse(readFileSync(join(contentDir, file), "utf8")));
      } catch (error) {
        throw new Error(`Invalid event file ${file}: ${String(error)}`);
      }
    });

  validateContent(events, (event, photo) => readWidths(photosDir, event, photo).length > 0);

  return sortEvents(events).map((event) => ({
    ...event,
    photos: event.photos.map((photo) => ({
      ...photo,
      widths: readWidths(photosDir, event.slug, photo.id),
    })),
  }));
}

let cache: ResolvedEvent[] | undefined;

export function getEvents(): ResolvedEvent[] {
  cache ??= loadEvents(
    join(contentRoot(), "events"),
    resolve(process.cwd(), `public${photosPath()}`),
  );
  return cache;
}

export function getEvent(slug: string): ResolvedEvent | undefined {
  return getEvents().find((event) => event.slug === slug);
}

export function getSite(): Site {
  return siteSchema.parse(JSON.parse(readFileSync(join(contentRoot(), "site.json"), "utf8")));
}

