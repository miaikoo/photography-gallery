import Link from "next/link";
import type { CSSProperties } from "react";
import { alternateRows, buildRows, ratioOf } from "@gallery/core";
import type { ResolvedPhoto } from "@/lib/content";
import { rowSizes } from "@/lib/sizes";
import { Photo } from "./Photo";
import { PhotoMorph } from "./PhotoMorph";
import { RevealRows } from "./RevealRows";

export type RowItem = {
  event: string;
  photo: ResolvedPhoto;
  href: string;
  caption?: { title: string; detail: string };
};

// morph needs each photo to appear once on the page, which a tag index can't promise.
type Props = { items: RowItem[]; priorityFirstRow?: boolean; morph?: boolean };

export function PhotoRows({ items, priorityFirstRow = false, morph = false }: Props) {
  const rows = alternateRows(
    buildRows(items.map((item) => ({ ...item, width: item.photo.width, height: item.photo.height }))),
  );

  return (
    <RevealRows>
      {rows.map((row, rowIndex) => {
        const rowRatio = row.reduce((sum, item) => sum + ratioOf(item), 0);
        // Only a list too small to form a full row is capped to the screen. A
        // final leftover row fills the width, so the page has no empty side.
        const short = rows.length === 1 && rowRatio < 2;
        return (
          <div
            key={row[0]!.href}
            className="photo-row"
            data-row=""
            data-short={short ? "" : undefined}
            style={{ "--row-ratio": rowRatio, "--row-gaps": row.length - 1 } as CSSProperties}
          >
            {row.map((item, tileIndex) => {
              const ratio = ratioOf(item);
              const photo = (
                <Photo
                  event={item.event}
                  photo={item.photo}
                  sizes={rowSizes(ratio, short ? 2 : rowRatio)}
                  priority={priorityFirstRow && rowIndex === 0}
                />
              );
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="photo-tile"
                  data-reveal={priorityFirstRow && rowIndex === 0 ? "in" : undefined}
                  style={{ "--ratio": ratio, "--i": tileIndex } as CSSProperties}
                >
                  {morph ? (
                    <PhotoMorph event={item.event} photoId={item.photo.id}>
                      {photo}
                    </PhotoMorph>
                  ) : (
                    photo
                  )}
                  {item.caption && (
                    <span className="photo-caption">
                      <strong className="font-title" data-caption-title="">
                        {item.caption.title}
                      </strong>
                      <small>{item.caption.detail}</small>
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        );
      })}
    </RevealRows>
  );
}
