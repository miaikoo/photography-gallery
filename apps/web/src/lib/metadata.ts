import type { Metadata } from "next";
import { getCover } from "@gallery/core";
import { getEvents } from "./content";
import { sharePhotoUrl } from "./share";

function newestCoverUrl(): string | undefined {
  const newest = getEvents()[0];
  return newest && sharePhotoUrl(newest.slug, getCover(newest));
}

type Options = { title?: string; description: string; image?: string };

export function pageMetadata({ title, description, image = newestCoverUrl() }: Options): Metadata {
  return {
    ...(title ? { title } : {}),
    description,
    openGraph: {
      title: title ?? "miaikoo",
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}
