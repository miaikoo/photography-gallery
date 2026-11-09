import type { Photo } from "@gallery/core";

type Props = { exif: Photo["exif"]; layout: "row" | "grid" };

export function ExifList({ exif, layout }: Props) {
  const fields = [
    ["Camera", exif.camera],
    ["Lens", exif.lens],
    ["Focal", exif.focalLength],
    ["Aperture", exif.aperture],
    ["Shutter", exif.shutter],
    ["ISO", exif.iso],
  ].filter(([, value]) => value !== undefined && value !== "");

  if (fields.length === 0) return null;

  return (
    <dl className="exif" data-exif="" data-layout={layout}>
      {fields.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
