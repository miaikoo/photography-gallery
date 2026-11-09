import { getPhotosByTag, getTags } from "@gallery/core";
import { PageHeading } from "@/components/PageHeading";
import { PhotoRows } from "@/components/PhotoRows";
import { getEvents } from "@/lib/content";
import { formatCount } from "@/lib/format";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata({ title: "Tags", description: "Browse photos by tag." });

export default function TagsPage() {
  const events = getEvents();
  const tags = getTags(events);

  return (
    <>
      <PageHeading title="tags" />
      {tags.length === 0 ? (
        <p>No tags yet.</p>
      ) : (
        <PhotoRows
          priorityFirstRow
          items={tags.map(({ tag, count }) => {
            const { event, photo } = getPhotosByTag(events, tag)[0]!;
            return {
              event: event.slug,
              photo,
              href: `/tags/${tag}/`,
              caption: { title: tag, detail: formatCount(count) },
            };
          })}
        />
      )}
    </>
  );
}
