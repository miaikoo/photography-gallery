import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPhotosByTag, getTags } from "@gallery/core";
import { PageHeading } from "@/components/PageHeading";
import { PhotoRows } from "@/components/PhotoRows";
import { getEvents } from "@/lib/content";
import { formatCount } from "@/lib/format";
import { sharePhotoUrl } from "@/lib/share";
import { paramsOrPlaceholder, PLACEHOLDER_SLUG } from "@/lib/static-params";

type Props = { params: Promise<{ tag: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return paramsOrPlaceholder(
    getTags(getEvents()).map(({ tag }) => ({ tag })),
    { tag: PLACEHOLDER_SLUG },
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tag } = await params;
  const first = getPhotosByTag(getEvents(), tag)[0];
  if (!first) return {};
  return {
    title: tag,
    description: `Photos tagged ${tag}.`,
    openGraph: {
      title: tag,
      description: `Photos tagged ${tag}.`,
      images: [sharePhotoUrl(first.event.slug, first.photo)],
    },
  };
}

export default async function TagPage({ params }: Props) {
  const { tag } = await params;
  const found = getPhotosByTag(getEvents(), tag);
  if (found.length === 0) notFound();

  return (
    <>
      <PageHeading title={tag} detail={formatCount(found.length)} />
      <PhotoRows
        priorityFirstRow
        items={found.map(({ event, photo }) => ({
          event: event.slug,
          photo,
          href: `/events/${event.slug}/${photo.id}/`,
        }))}
      />
    </>
  );
}
