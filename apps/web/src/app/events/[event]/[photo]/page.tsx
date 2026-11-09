import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { getAdjacentPhotos, ratioOf } from "@gallery/core";
import { ExifList } from "@/components/ExifList";
import { Photo } from "@/components/Photo";
import { PhotoControls } from "@/components/PhotoControls";
import { PhotoGestures } from "@/components/PhotoGestures";
import { PhotoMorph } from "@/components/PhotoMorph";
import { PhotoThumbs } from "@/components/PhotoThumbs";
import { getEvent, getEvents } from "@/lib/content";
import { formatShortDate } from "@/lib/format";
import { pageMetadata } from "@/lib/metadata";
import { sharePhotoUrl } from "@/lib/share";
import { paramsOrPlaceholder, PLACEHOLDER_SLUG } from "@/lib/static-params";

type Props = { params: Promise<{ event: string; photo: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return paramsOrPlaceholder(
    getEvents().flatMap((event) => event.photos.map((photo) => ({ event: event.slug, photo: photo.id }))),
    { event: PLACEHOLDER_SLUG, photo: PLACEHOLDER_SLUG },
  );
}

async function find(params: Props["params"]) {
  const { event: slug, photo: id } = await params;
  const event = getEvent(slug);
  const photo = event?.photos.find((candidate) => candidate.id === id);
  return event && photo ? { event, photo } : undefined;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await find(params);
  if (!found) return {};
  const { event, photo } = found;
  const { index, total } = getAdjacentPhotos(event, photo.id);
  return pageMetadata({
    title: `${event.title}, photo ${index + 1} of ${total}`,
    description: photo.alt,
    image: sharePhotoUrl(event.slug, photo),
  });
}

export default async function PhotoPage({ params }: Props) {
  const found = await find(params);
  if (!found) notFound();
  const { event, photo } = found;

  const { prev, next, index, total } = getAdjacentPhotos(event, photo.id);
  const eventHref = `/events/${event.slug}/`;
  const hrefOf = (target?: { id: string }) => (target ? `${eventHref}${target.id}/` : undefined);
  const prevHref = hrefOf(prev);
  const nextHref = hrefOf(next);
  const ratio = ratioOf(photo);
  const landscape = ratio >= 1;

  return (
    <div className="photo-page" data-orientation={landscape ? "landscape" : "portrait"} style={{ "--ratio": ratio } as CSSProperties}>
      <div className="photo-left">
        <div className="photo-frame" data-photo-main="">
          <PhotoGestures eventHref={eventHref} prevHref={prevHref} nextHref={nextHref}>
            <PhotoMorph event={event.slug} photoId={photo.id}>
              <Photo
                event={event.slug}
                photo={photo}
                priority
                sizes={landscape ? "(min-width: 1024px) calc(100vw - 312px), 100vw" : "(min-width: 1024px) 50vw, 100vw"}
              />
            </PhotoMorph>
          </PhotoGestures>
        </div>
        {landscape && <ExifList exif={photo.exif} layout="row" />}
      </div>
      <div className="photo-panel" data-panel="">
        <header className="photo-heading">
          <h1 className="font-title text-[23px] leading-[1.08] lg:text-[28px]">
            <Link href={eventHref}>{event.title}</Link>
          </h1>
          <p className="text-xs text-muted tabular-nums lg:text-[13px]">
            Photo {index + 1} of {total} · {formatShortDate(photo.exif.date ?? event.date)}
          </p>
        </header>
        {!landscape && <ExifList exif={photo.exif} layout="grid" />}
        <PhotoControls prevHref={prevHref} nextHref={nextHref} />
        <PhotoThumbs event={event} currentId={photo.id} />
      </div>
    </div>
  );
}
