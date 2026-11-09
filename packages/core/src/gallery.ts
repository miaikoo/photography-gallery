import { displayOrder } from "./rows";
import type { Event, Photo } from "./schema";

type AnyEvent = Omit<Event, "photos"> & { photos: Photo[] };
type PhotoOf<E extends AnyEvent> = E["photos"][number];

export function sortEvents<T extends { date: string }>(events: T[]): T[] {
  return [...events].sort((a, b) => b.date.localeCompare(a.date));
}

export function getAdjacentPhotos<E extends AnyEvent>(
  event: E,
  photoId: string,
): { prev?: PhotoOf<E>; next?: PhotoOf<E>; index: number; total: number } {
  // Follows the rows on screen, so "next" never jumps back across a mirrored row.
  const photos = displayOrder<PhotoOf<E>>(event.photos);
  const index = photos.findIndex((photo) => photo.id === photoId);
  if (index < 0) throw new Error(`No photo "${photoId}" in event "${event.slug}"`);
  return {
    prev: photos[index - 1],
    next: photos[index + 1],
    index,
    total: photos.length,
  };
}

export function getCover<E extends AnyEvent>(event: E): PhotoOf<E> {
  const cover = event.photos.find((photo) => photo.id === event.coverPhotoId);
  if (!cover) throw new Error(`No cover photo in event "${event.slug}"`);
  return cover;
}

export function getTags(events: AnyEvent[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const event of events) {
    for (const photo of event.photos) {
      for (const tag of new Set(photo.tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => a.tag.localeCompare(b.tag));
}

export function getPhotosByTag<E extends AnyEvent>(
  events: E[],
  tag: string,
): { event: E; photo: PhotoOf<E> }[] {
  return sortEvents(events).flatMap((event) =>
    event.photos.filter((photo) => photo.tags.includes(tag)).map((photo) => ({ event, photo })),
  );
}
