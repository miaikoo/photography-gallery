import { getCover } from "@gallery/core";
import { PhotoRows } from "@/components/PhotoRows";
import { getEvents } from "@/lib/content";
import { formatCount, formatDate } from "@/lib/format";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata({ description: "Street and nature photographs by miaikoo." });

export default function HomePage() {
  const events = getEvents();
  if (events.length === 0) return <p>No photos yet.</p>;

  return (
    <>
      <h1 className="sr-only">Events</h1>
      <PhotoRows
        priorityFirstRow
        morph
        items={events.map((event) => ({
          event: event.slug,
          photo: getCover(event),
          href: `/events/${event.slug}/`,
          caption: {
            title: event.title,
            detail: `${formatDate(event.date)} · ${formatCount(event.photos.length)}`,
          },
        }))}
      />
    </>
  );
}
