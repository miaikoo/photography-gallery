"use client";

import { useEffect, useRef, useState } from "react";
import { preload } from "react-dom";
import type { ResolvedPhoto } from "@/lib/content";
import { photoUrl } from "@/lib/photo-url";

type Props = {
  event: string;
  photo: ResolvedPhoto;
  sizes: string;
  priority?: boolean;
  className?: string;
};

export function Photo({ event, photo, sizes, priority = false, className = "" }: Props) {
  const ref = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);

  // The image may finish loading before hydration, when onLoad can no longer fire.
  useEffect(() => {
    if (ref.current?.complete) setLoaded(true);
  }, []);

  const srcSet = (format: "avif" | "webp") =>
    photo.widths.map((width) => `${photoUrl(event, photo.id, width, format)} ${width}w`).join(", ");
  const largest = photo.widths.at(-1)!;

  if (priority) {
    preload(photoUrl(event, photo.id, largest, "avif"), {
      as: "image",
      type: "image/avif",
      imageSrcSet: srcSet("avif"),
      imageSizes: sizes,
      fetchPriority: "high",
    });
  }

  return (
    <span className={`photo ${className}`} style={{ backgroundImage: `url("${photo.placeholder}")` }}>
      <picture>
        <source type="image/avif" srcSet={srcSet("avif")} sizes={sizes} />
        <source type="image/webp" srcSet={srcSet("webp")} sizes={sizes} />
        <img
          ref={ref}
          src={photoUrl(event, photo.id, largest, "webp")}
          width={photo.width}
          height={photo.height}
          alt={photo.alt}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          decoding={priority ? "sync" : "async"}
          data-fade={priority ? undefined : ""}
          data-loaded={loaded ? "" : undefined}
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
        />
      </picture>
    </span>
  );
}
