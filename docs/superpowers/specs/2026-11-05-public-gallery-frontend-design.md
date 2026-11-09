# Public Gallery Front End: Design Spec

Date: November 5, 2026

Visual rules live in `DESIGN.md`. Product scope lives in `PRD.md`. This spec defines how the public site (`apps/web`) is built.

## Goal

Build a fast, static, English-language gallery that the owner is happy to link from their bio. Photos fill the screen on white, display uncropped, and work well on phones and laptops.

## Scope

**In scope**

- Homepage, event, photo, tag, about, and 404 pages
- Shared site header and photo row layout
- Keyboard and swipe navigation on photo pages
- Copy link and social share previews
- Content schema and development fixtures
- Tests for everything above

**Out of scope**

- The local upload app (`apps/studio`)
- The image pipeline: resizing, metadata removal, and watermarking
- Analytics
- User accounts, comments, and payments

## Routes

All routes are pre-rendered with Next.js static export.

| Route | Page | Content |
| --- | --- | --- |
| `/` | Homepage | Event covers, newest first |
| `/events/[event]` | Event | Title, date, count, tags, and photos in curated order |
| `/events/[event]/[photo]` | Photo | Large photo, EXIF, controls, and more from the event |
| `/tags` | Tag index | All tags with photo counts, A to Z |
| `/tags/[tag]` | Tag | Photos with that tag, newest event first |
| `/about` | About | Short bio and Instagram link |

The `events` navigation item links to `/`. A styled `404.html` covers unknown URLs.

Previous and next always move within the photo's event, including when a visitor arrives from a tag page.

## Content model

`packages/core` owns these Zod schemas and types. Each event is one JSON file at `content/events/<event-slug>.json`.

```ts
type Event = {
  slug: string;
  title: string;
  date: string; // ISO date
  coverPhotoId: string; // must match a photo in this event
  photos: Photo[]; // at least one, in curated order
};

type Photo = {
  id: string; // unique within the event, used in the URL
  width: number;
  height: number;
  alt: string; // required and non-empty
  tags: string[]; // lowercase
  placeholder: string; // small blurred data URL
  exif: {
    date?: string;
    camera?: string;
    lens?: string;
    focalLength?: string;
    aperture?: string;
    shutter?: string;
    iso?: number;
  };
};
```

The site shows these values as stored, and it can't tell whether they came from the camera or the owner. The upload app will prefill them from each photo's EXIF and let the owner edit them, for example to correct a wrong camera date. Edits only change this JSON, never the original file.

The `exif` schema is strict, so an unknown key such as GPS data fails validation. The build also fails on invalid JSON, a missing image file, a duplicate slug or ID, or a `coverPhotoId` with no match.

Images are stored as `public/photos/<event>/<photo>-<width>.<avif|webp>`, in widths 640, 1024, 1600, and 2400. Smaller originals skip the widths they can't fill, and the schema records nothing extra for this because the build reads which files exist.

The `© miaikoo` credit is burned into each image by the pipeline. The site must not draw it with CSS, because visitors could remove it.

## Photo rows

Homepage, event, and tag pages share `buildRows(photos, targetRatio = 2)`, a pure function in `packages/core`. `alternateRows` then mirrors a row that repeats the pattern of the row above, and `displayOrder` gives previous, next, and the thumbnails the same order.

1. Add photos to a row in order until the sum of their width-to-height ratios reaches 2.
2. Start the next row.
3. If the final row falls short of 2, keep it as a full-width row when its ratio is at least 1.4, and otherwise merge it into the previous row.
4. If the whole list falls short of 2, return it as one row.

`<PhotoRows>` renders each photo with `flex-grow` set to its ratio and `aspect-ratio` set from its dimensions. Rows need no JavaScript and no measurement, so the server-rendered HTML is already correct and the layout doesn't shift.

Below 640px, rows stack and every photo takes the full width. On wider screens, a row that falls short of 2 because the whole list is too small is limited to the height of the screen, so a lone photo never exceeds the viewport.

## Photo page

Orientation comes from the photo's dimensions: a ratio of 1 or more uses the landscape layout, and anything below 1 uses the portrait layout.

**Landscape, 1024px and wider**

- The photo sits on the left, sized to fit both the available width and the screen height.
- One EXIF row runs below it.
- A side column of at least 240px holds the title, photo position and date, controls, and more from the event.

**Portrait, 1024px and wider**

- The photo takes the available screen height.
- The panel beside it holds the title, position and date, a 3-by-2 EXIF grid, controls, and more from the event.

**Below 1024px**

- The photo comes first at full width.
- The title, details, EXIF grid, controls, and thumbnails follow in one column.

On larger screens, the panel gains thumbnail columns to use the extra width. On laptops, it scrolls separately when thumbnails overflow. Thumbnails keep their original ratios and mark the current photo.

Hide any EXIF field with no value, and hide the EXIF block if all fields are empty.

### Interaction

- Previous and next are real links, so they work without JavaScript. They are hidden at the first and last photo.
- Left and right arrow keys change photos instantly. Escape returns to the event.
- On touch screens, a swipe changes photos when it passes a distance threshold or a velocity of about 0.11 px/ms. Extra fingers are ignored, and the first and last photos resist the drag.
- Copy link writes the page URL to the clipboard and briefly shows `Copied`. If that fails, it shows `Couldn't copy link`.

These are small client components. Everything else is server-rendered.

## Images and performance

- `<Photo>` renders `<picture>` with AVIF and WebP sources, `srcset`, and a `sizes` value for its layout. Next.js image optimization stays off.
- Photos in the first row, and the main photo on a photo page, load eagerly with `fetchpriority="high"`. The rest load lazily.
- Lazy photos crossfade from the blurred placeholder over 200ms, or switch without motion under `prefers-reduced-motion`. Eagerly loaded photos appear without a fade, because hiding them would delay the first photo.
- Row tiles reveal once as they reach the screen, and the first row plays on load. `RevealRows` handles this with one `IntersectionObserver`. Without JavaScript nothing is hidden.
- `PhotoMorph` shares a photo between the homepage, event, and photo pages through a React `ViewTransition`, enabled by `experimental.viewTransition`. Browsers without view transitions navigate instantly.
- Fraunces and Plus Jakarta Sans are self-hosted through `next/font`.

Target: the first photo appears within 2.5 seconds on simulated 4G, enforced by Lighthouse CI.

## Sharing

Each page gets its own title, description, and Open Graph tags. Photo pages use their own 1600px WebP as the preview image. Absolute URLs come from a `SITE_URL` build variable, and the build fails in production if it's missing.

## Accessibility and states

- Every gallery photo uses its `alt` text. Thumbnails are links labelled with the position, such as `Photo 4 of 22`.
- Controls are reachable by keyboard and have a visible focus style.
- Icons are SVG, and icon-only controls have accessible names.
- Hover effects apply only under `@media (hover: hover) and (pointer: fine)`.
- Captions are checked against the owner's brightest photos before launch.
- If an image fails to load, its reserved space stays in place and the browser shows the alt text.
- The homepage shows `No photos yet.` when there are no events. Tags with no photos don't get a page.

## Development fixtures

Development uses generated images at 3:2 and 2:3, created by a script and listed in fixture JSON. Fixtures never appear in production builds.

Real photos enter the repo only after the image pipeline and CI privacy check exist. The repo is public and git history keeps every pushed file, so one image with GPS data would stay exposed even after deletion. This changes the PRD's order: the gallery can be deployed in phase 2, but its first real link waits for phase 3.

Until then, a production build has no events and shows the homepage empty state.

## Testing

**Vitest**

- `buildRows`: both ratios, mixed input, leftover merging, one photo, and empty input
- Schemas: valid content, GPS rejection, missing alt text, and a bad cover ID
- Helpers: previous and next, tag grouping, and event sorting

**Playwright, at 1440 by 900 and 390 by 844**

- Homepage to event to photo, then back
- Arrow keys, Escape, swipe, and copy link
- EXIF fields hidden when empty
- Tag filtering across events
- No horizontal scrolling on any page

**CI:** lint, type checks, tests, build, and Lighthouse CI.

## Inputs needed from the owner

The build can start without these, but launch can't:

- The `vercel.app` subdomain, which sets `SITE_URL`
- The about page bio and Instagram link
- The photos and metadata for the first 2-3 events
