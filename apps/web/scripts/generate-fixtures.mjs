// Generates development photos and JSON. Never used by production builds.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const contentDir = join(webRoot, "../../content/fixtures");
const photosDir = join(webRoot, "public/fixture-photos");
const WIDTHS = [640, 1024, 1600, 2400];
const FULL_EXIF = {
  date: "2026-08-17",
  camera: "Fujifilm X-T5",
  lens: "XF 23mm F1.4",
  focalLength: "23mm",
  aperture: "f/5.6",
  shutter: "1/250s",
  iso: 200,
};

const landscape = [3, 2];
const portrait = [2, 3];

const events = [
  {
    slug: "morning-fog",
    title: "Morning Fog",
    date: "2026-08-17",
    hue: 150,
    photos: [
      { id: "01", shape: landscape, tags: ["nature", "hills"], exif: FULL_EXIF },
      { id: "02", shape: portrait, tags: ["nature"], exif: FULL_EXIF },
      { id: "03", shape: landscape, tags: ["nature"], exif: FULL_EXIF },
      { id: "04", shape: landscape, tags: ["nature"], exif: FULL_EXIF },
      { id: "05", shape: [1, 1], tags: ["nature"], exif: FULL_EXIF },
      { id: "06", shape: [3, 1], tags: ["nature"], exif: FULL_EXIF },
    ],
  },
  {
    slug: "wet-night-downtown",
    title: "Wet Night Downtown",
    date: "2026-09-20",
    hue: 250,
    photos: [
      { id: "01", shape: portrait, tags: ["street"], exif: FULL_EXIF },
      { id: "02", shape: portrait, tags: ["street"], exif: FULL_EXIF },
      { id: "03", shape: portrait, tags: ["street"], exif: FULL_EXIF },
      { id: "04", shape: landscape, tags: ["street", "nature"], exif: { iso: 800 } },
    ],
  },
  {
    slug: "a-deliberately-long-event-title-that-must-wrap-on-a-small-phone-screen",
    title: "A Deliberately Long Event Title That Must Wrap on a Small Phone Screen",
    date: "2026-10-12",
    hue: 25,
    photos: [{ id: "01", shape: landscape, tags: ["street"], exif: {}, maxWidth: 1200 }],
  },
  {
    slug: "two-frames",
    title: "Two Frames",
    date: "2026-07-01",
    hue: 300,
    photos: ["01", "02"].map((id) => ({ id, shape: portrait, tags: ["pair"], exif: FULL_EXIF })),
  },
  {
    slug: "many-tags",
    title: "Many Tags",
    date: "2026-06-01",
    hue: 60,
    photos: [
      {
        id: "01",
        shape: landscape,
        tags: Array.from({ length: 12 }, (_, i) => `long-tag-name-${String(i + 1).padStart(2, "0")}`),
        exif: FULL_EXIF,
      },
    ],
  },
  {
    slug: "large-roll",
    title: "Large Roll",
    date: "2026-05-01",
    hue: 200,
    photos: Array.from({ length: 22 }, (_, i) => ({
      id: String(i + 1).padStart(2, "0"),
      shape: i % 3 === 1 ? portrait : landscape,
      tags: ["roll"],
      exif: FULL_EXIF,
    })),
  },
  {
    slug: "final-square",
    title: "Final Square",
    date: "2026-04-01",
    hue: 100,
    photos: [
      { id: "01", shape: landscape, tags: ["square"], exif: FULL_EXIF },
      { id: "02", shape: landscape, tags: ["square"], exif: FULL_EXIF },
      { id: "03", shape: [1, 1], tags: ["square"], exif: FULL_EXIF },
    ],
  },
];

function art(width, height, hue, index) {
  const fontSize = Math.round(width * 0.016);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue + index * 14} 55% 62%)"/>
      <stop offset="1" stop-color="hsl(${hue + index * 14 + 40} 45% 22%)"/>
    </linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <text x="${width - fontSize}" y="${height - fontSize}" text-anchor="end" font-family="sans-serif" font-size="${fontSize}" fill="rgba(255,255,255,.78)">© miaikoo</text>
  </svg>`);
}

rmSync(contentDir, { recursive: true, force: true });
rmSync(photosDir, { recursive: true, force: true });
mkdirSync(join(contentDir, "events"), { recursive: true });

for (const event of events) {
  const dir = join(photosDir, event.slug);
  mkdirSync(dir, { recursive: true });

  const photos = await Promise.all(
    event.photos.map(async ({ id, shape, tags, exif, maxWidth }, index) => {
      const [ratioW, ratioH] = shape;
      const fullWidth = maxWidth ?? 2400;
      const fullHeight = Math.round((fullWidth * ratioH) / ratioW);
      const master = await sharp(art(fullWidth, fullHeight, event.hue, index)).png().toBuffer();

      const widths = maxWidth ? [...WIDTHS.filter((w) => w < maxWidth), maxWidth] : WIDTHS;
      await Promise.all(
        widths.flatMap((width) => [
          sharp(master).resize(width).webp({ quality: 70 }).toFile(join(dir, `${id}-${width}.webp`)),
          sharp(master).resize(width).avif({ quality: 50, effort: 2 }).toFile(join(dir, `${id}-${width}.avif`)),
        ]),
      );

      const blurred = await sharp(master).resize(24).blur(1).webp({ quality: 40 }).toBuffer();
      return {
        id,
        width: fullWidth,
        height: fullHeight,
        alt: `Sample photo ${id} from ${event.title}`,
        tags,
        placeholder: `data:image/webp;base64,${blurred.toString("base64")}`,
        exif,
      };
    }),
  );

  const { slug, title, date } = event;
  writeFileSync(
    join(contentDir, "events", `${slug}.json`),
    JSON.stringify({ slug, title, date, coverPhotoId: "01", photos }, null, 2),
  );
}

writeFileSync(
  join(contentDir, "site.json"),
  JSON.stringify({
    bio: "I photograph streets and nature on slow weekends. This is where the keepers live.",
    instagramUrl: "",
  }),
);
