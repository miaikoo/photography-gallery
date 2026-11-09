import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeading } from "@/components/PageHeading";
import { PhotoRows } from "@/components/PhotoRows";
import { getEvent, getEvents } from "@/lib/content";
import { formatCount, formatDate } from "@/lib/format";
import { sharePhotoUrl } from "@/lib/share";
import { paramsOrPlaceholder, PLACEHOLDER_SLUG } from "@/lib/static-params";

type Props = { params: Promise<{ event: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return paramsOrPlaceholder(
    getEvents().map((event) => ({ event: event.slug })),
    { event: PLACEHOLDER_SLUG },
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const event = getEvent((await params).event);
  if (!event) return {};
  const description = `${formatDate(event.date)} · ${formatCount(event.photos.length)}`;
  return {
    title: event.title,
    description,
    openGraph: {
      title: event.title,
      description,
      images: [sharePhotoUrl(event.slug, event.photos[0]!)],
    },
  };
}

export default async function EventPage({ params }: Props) {
  const event = getEvent((await params).event);
  if (!event) notFound();

  const tags = [...new Set(event.photos.flatMap((photo) => photo.tags))].sort();

  return (
    <>
      <PageHeading
        title={event.title}
        detail={`${formatDate(event.date)} · ${formatCount(event.photos.length)}`}
        tags={tags}
      />
      <PhotoRows
        morph
        priorityFirstRow
        items={event.photos.map((photo) => ({
          event: event.slug,
          photo,
          href: `/events/${event.slug}/${photo.id}/`,
        }))}
      />
    </>
  );
}
