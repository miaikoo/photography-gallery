# miaikoo

A personal gallery for street and nature photographs, built as a static site with no database or server.

## Run it

You need Node 22 or newer and pnpm 9.

```bash
pnpm install
pnpm --filter web dev
```

The dev command generates sample photos, then starts the site at http://localhost:3000. It shows sample photos only, never your published events.

To see your real photos, run:

```bash
pnpm --filter web preview
```

It builds the site from `content/events` and serves it at http://localhost:4173. A build removes the generated sample photos, so `dev` regenerates them the next time you run it.

## Project layout

| Path | Purpose |
| --- | --- |
| `apps/web` | Public site, a Next.js static export |
| `packages/core` | Content schemas and gallery logic |
| `content/events` | One JSON file per event |
| `content/site.json` | About page bio and Instagram link |
| `apps/web/public/photos` | Published images |

Each image is named `<event>/<photo>-<width>.<avif|webp>`. The build fails if content is invalid, an image is missing, or EXIF data includes an unknown field such as GPS.

## Add photos

Put an event's JPEGs in a folder under `originals/`. The folder name becomes the event name, so use lowercase letters, numbers and hyphens, for example `originals/bromo-trip`. Originals are never changed.

```bash
pnpm photos originals/bromo-trip
```

The first run creates `originals/bromo-trip/event.json` and stops. Open it and fill in the title, date and each photo's alt text, then run the same command again. It encodes the photos and writes `content/events/bromo-trip.json` and `apps/web/public/photos/bromo-trip/`. Run it again after adding photos or editing `event.json`; photos that haven't changed are reused. The folder must be inside `originals/` (or outside the repo): the command refuses a folder in the repo that git doesn't ignore.

To drop a photo, move its file out of the folder and delete its entry in `event.json`. If you only delete the entry, the next run adds the file back as a new photo with a new ID and empty alt text.

Exports are 640, 1024, 1600 and 2400 px wide, each as AVIF (quality 50) and WebP (quality 75), with `© miaikoo` burned in at the bottom right. Photos tagged Adobe RGB are converted to sRGB. Photos smaller than 2400 px get fewer sizes.

Public images and event files carry no EXIF, XMP or GPS data. Check it with:

```bash
pnpm test:privacy
```

It also fails if git tracks or has staged anything under `originals/`, any JPEG, RAW, HEIC or TIFF file, an `event.json` or a `.photos-cache.json`, anywhere in the repo. It runs in CI. Run it after `git add` and before pushing, so it sees what you staged.

## Test it

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:privacy
pnpm --filter web test:e2e
pnpm --filter web test:lighthouse
```

Browser tests use generated fixtures from `pnpm --filter web fixtures`. They use Playwright's Chromium by default. To use an installed browser instead, set `PLAYWRIGHT_CHANNEL`, for example to `msedge`.

Lighthouse needs Chrome. If it isn't found, set `CHROME_PATH` to a Chromium-based browser.

## Deploy

Set `SITE_URL` to the site's address in production. The build fails without it.

In the Vercel project settings, set Root Directory to `apps/web`. Security headers live in `apps/web/vercel.json`, and Vercel only reads it from the project root. The headers take effect on Vercel, not in `pnpm --filter web preview`, which uses `serve`.

## More

- [Design system](DESIGN.md)
- [Product requirements](PRD.md)
- [Front end spec](docs/superpowers/specs/2026-11-05-public-gallery-frontend-design.md)
