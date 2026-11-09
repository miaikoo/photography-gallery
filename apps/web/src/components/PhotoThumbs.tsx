"use client";

import { displayOrder } from "@gallery/core";
import Link from "next/link";
import { useEffect, useRef } from "react";
import type { ResolvedEvent } from "@/lib/content";
import { Photo } from "./Photo";

// Small events get larger thumbnails, so the panel doesn't sit half empty.
const FEW_PHOTOS = 8;

type Props = { event: ResolvedEvent; currentId: string };

export function PhotoThumbs({ event, currentId }: Props) {
  const ref = useRef<HTMLElement>(null);

  // Scrolls only the panel. scrollIntoView would also move the page on phones.
  useEffect(() => {
    const panel = ref.current;
    const current = panel?.querySelector('[aria-current="page"]');
    if (!panel || !current) return;
    const panelBox = panel.getBoundingClientRect();
    const box = current.getBoundingClientRect();
    panel.scrollTop += box.top - panelBox.top - (panelBox.height - box.height) / 2;
  }, [currentId]);

  if (event.photos.length < 2) return null;

  return (
    <nav
      ref={ref}
      aria-label="More from this event"
      className="photo-thumbs"
      data-few={event.photos.length <= FEW_PHOTOS ? "" : undefined}
    >
      <ul>
        {displayOrder(event.photos).map((photo, index) => (
          <li key={photo.id}>
            <Link
              href={`/events/${event.slug}/${photo.id}/`}
              aria-label={`Photo ${index + 1} of ${event.photos.length}`}
              aria-current={photo.id === currentId ? "page" : undefined}
            >
              <Photo event={event.slug} photo={{ ...photo, alt: "" }} sizes="240px" />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
