# Public Gallery Front End Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the static, English-language public gallery in `apps/web`, backed by tested content logic in `packages/core`.

**Architecture:** A pnpm monorepo. `packages/core` holds pure schemas and gallery logic with no file system access. `apps/web` is a Next.js App Router static export that loads JSON at build time and renders almost everything on the server, with small client components for keyboard, swipe, image fade, and copy link.

**Tech Stack:** TypeScript strict, Next.js App Router with `output: "export"`, Tailwind CSS 4, Zod, sharp (fixtures only), Vitest, Playwright, axe, Lighthouse CI.

**Spec:** `docs/superpowers/specs/2026-11-05-public-gallery-frontend-design.md`. Visual values come from `DESIGN.md`. Read both.

## Global Constraints

- No git: the owner will set it up later. Do not run `git init` or commit. `.gitignore` and the CI file are still written for later.
- Node 22 or newer, pnpm 9.12.2, packages named `@gallery/core` and `web`.
- All site copy is in English. Navigation is lowercase: `events`, `tags`, `about`. The logo is `miaikoo`, without ©.
- The `© miaikoo` credit is burned into image files and is never drawn with site CSS.
- Margins are 24px on laptop and 12px on phone. Header height is 58px on laptop and 46px on phone.
- Photos have square corners, no shadows, and no cropping in gallery views. No reveal-on-scroll animation.
- Titles use Fraunces 500 with `SOFT` 100 and `WONK` 1. They are never all caps or condensed. Details use Plus Jakarta Sans. Interface text stays at 11px or larger.
- Use the color values in `DESIGN.md`, defined as Tailwind theme tokens in `globals.css`.
- Icons are SVG, not Unicode glyphs.
- Next.js image optimization stays off. Fixtures never appear in production builds.

## Review Focus

- An event's first or last photo, or a one-photo event: controls and keys must not lead to a missing page.
- A very long event title on a 390px phone: the text wraps and the page never scrolls sideways.
- A photo narrower than 1600px: the share preview falls back to its largest image instead of a broken URL.
- Alt+Left or Ctrl+Left on a photo page: the browser shortcut keeps working and the site doesn't intercept it.
- A square or panoramic photo in a 3:2 and 2:3 gallery: it still displays uncropped, without breaking the row or photo page.

---

### Task 1: Workspace and content core

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `.nvmrc`
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/vitest.config.ts`
- Create: `packages/core/src/index.ts`, `schema.ts`, `rows.ts`, `gallery.ts`
- Test: `packages/core/src/schema.test.ts`, `rows.test.ts`, `gallery.test.ts`

**Interfaces:**
- Produces, all exported from `@gallery/core`:
  - `eventSchema`, `siteSchema`, and types `Event`, `Photo`, `Site`, where `Site = { bio: string; instagramUrl: string }`
  - `validateContent(events: Event[], imageExists: (event: string, photo: string) => boolean): void`
  - `buildRows<T extends { width: number; height: number }>(photos: T[], targetRatio = 2): T[][]`
  - `ratioOf(photo: { width: number; height: number }): number`
  - `sortEvents(events: Event[]): Event[]`, newest first
  - `getAdjacentPhotos(event: Event, photoId: string): { prev?: Photo; next?: Photo; index: number; total: number }`
  - `getCover(event: Event): Photo`
  - `getTags(events: Event[]): { tag: string; count: number }[]`, A to Z
  - `getPhotosByTag(events: Event[], tag: string): { event: Event; photo: Photo }[]`, newest event first, curated order within an event

- [ ] **Step 1: Create the workspace**

`.gitignore` covers `node_modules`, `.next`, `out`, `.superpowers`, `.impeccable`, `apps/web/public/fixture-photos`, `content/fixtures`, `test-results`, `playwright-report`, `.lighthouseci`, and original photo folders named `originals/`. Root scripts: `test`, `typecheck`, and `lint`, each running across the workspace.

- [ ] **Step 2: Write failing schema tests**

Use one valid fixture object. Assert:
- `valid event parses`
- `GPS in exif is rejected`: `exif: { gps: "1,1" }` fails
- `empty alt is rejected`
- `cover must match a photo`: an unknown `coverPhotoId` fails
- `duplicate photo id is rejected`
- `event needs a photo`: `photos: []` fails
- `unsafe slugs and tags are rejected`: `"Street Photo"` fails for slug, photo ID, and tag, with `^[a-z0-9-]+$` as the rule
- `validateContent` throws naming a duplicate event slug
- `validateContent` throws naming `event/photo` when `imageExists` returns false

- [ ] **Step 3: Write failing row tests**

```ts
const L = { width: 3, height: 2 };
const P = { width: 2, height: 3 };
const S = { width: 1, height: 1 };
const W = { width: 3, height: 1 };

expect(buildRows([])).toEqual([]);
expect(buildRows([L])).toEqual([[L]]);
expect(buildRows([L, P, L, L])).toEqual([[L, P], [L, L]]);
expect(buildRows([P, P, P, L, L])).toEqual([[P, P, P], [L, L]]);
expect(buildRows([L, L, P])).toEqual([[L, L, P]]); // leftover merges into previous row
expect(buildRows([W, L])).toEqual([[W, L]]); // leftover L merges after panorama fills a row
expect(buildRows([S, L])).toEqual([[S, L]]);
```

- [ ] **Step 4: Write failing gallery tests**

Assert: events sort newest first; `getAdjacentPhotos` returns no `prev` at the first photo, no `next` at the last, neither for one photo, and throws for an unknown ID; `getTags` counts across events A to Z; `getPhotosByTag` spans two events, newest first.

- [ ] **Step 5: Run tests to verify they fail**

Run: `pnpm --filter @gallery/core test`
Expected: FAIL on missing modules.

- [ ] **Step 6: Implement `schema.ts`, `rows.ts`, and `gallery.ts`**

Schema fields follow the spec's content model, using `.strict()` on `exif` and `z.iso.date()` or an equivalent ISO date check for dates. Cover and duplicate photo checks use `superRefine`. `placeholder` must start with `data:image/`.

- [ ] **Step 7: Run tests and typecheck**

Run: `pnpm --filter @gallery/core test && pnpm typecheck`
Expected: PASS.

### Task 2: Web app, content loading, fixtures, and header

**Files:**
- Create: `apps/web/package.json`, `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`
- Create: `apps/web/src/app/layout.tsx`, `globals.css`, `page.tsx`, `not-found.tsx`
- Create: `apps/web/src/components/SiteHeader.tsx`
- Create: `apps/web/src/lib/content.ts`, `site-url.ts`, `static-params.ts`
- Create: `apps/web/scripts/generate-fixtures.mjs`, `prebuild.mjs`, `postbuild.mjs`
- Create: `content/events/.gitkeep`, `content/site.json`
- Test: `apps/web/src/lib/content.test.ts`, `site-url.test.ts`

**Interfaces:**
- Consumes: Task 1 exports.
- Produces:
  - `type ResolvedPhoto = Photo & { widths: number[] }`, `type ResolvedEvent = Omit<Event, "photos"> & { photos: ResolvedPhoto[] }`
  - `getEvents(): ResolvedEvent[]`, sorted and cached; `getEvent(slug: string): ResolvedEvent | undefined`; `getSite(): Site`
  - `photoUrl(event: string, photo: string, width: number, format: "avif" | "webp"): string`
  - `getSiteUrl(): string`
  - `paramsOrPlaceholder<T extends object>(params: T[], placeholder: T): T[]` and the constant `PLACEHOLDER_SLUG = "__none"`
  - `<SiteHeader />`

- [ ] **Step 1: Write failing loader tests**

Using a temp folder, assert: `getEvents` reads valid JSON; invalid JSON throws naming the file; a missing image throws through `validateContent`; `widths` lists only widths with both AVIF and WebP, ascending.

Make the loader testable with `loadEvents(contentDir: string, photosDir: string): ResolvedEvent[]`, which `getEvents` wraps.

- [ ] **Step 2: Write failing `getSiteUrl` tests**

Assert: returns `SITE_URL` without a trailing slash; defaults to `http://localhost:4173` outside production; throws when `VERCEL_ENV=production` and `SITE_URL` is unset.

- [ ] **Step 3: Scaffold the app**

Set `output: "export"`, `trailingSlash: true`, `images.unoptimized: true`, and `transpilePackages: ["@gallery/core"]`.

Content source: `CONTENT_SOURCE=fixtures` reads `content/fixtures/events` and serves `/fixture-photos`. Otherwise it reads `content/events` and serves `/photos`. `content/site.json` starts as `{ "bio": "", "instagramUrl": "" }`.

Load Fraunces and Plus Jakarta Sans through `next/font/google`, with Fraunces axes `SOFT`, `WONK`, and `opsz`. Add this inline script to the document head so lazy photos stay visible without JavaScript: `document.documentElement.classList.add('js')`.

- [ ] **Step 4: Write `generate-fixtures.mjs`**

Use sharp with SVG gradients to create images with a burned `© miaikoo` credit, plus JSON using these pinned IDs, which the E2E tests rely on:

| Event slug | Date | Photos | Tags |
| --- | --- | --- | --- |
| `morning-fog` | 2026-08-17 | `01` 3:2, `02` 2:3, `03` 3:2, `04` 3:2, `05` 1:1, `06` 3:1, all with full EXIF | `nature` on all, `hills` on `01` |
| `wet-night-downtown` | 2026-09-20 | `01` 2:3, `02` 2:3, `03` 2:3, `04` 3:2 with EXIF `iso` only | `street` on all, `nature` on `04` |
| `a-deliberately-long-event-title-that-must-wrap-on-a-small-phone-screen` | 2026-10-12 | `01` 3:2, 1200px wide only, empty EXIF | `street` |

Make the widest fixture variant 2400px except where noted, and write all four widths in AVIF and WebP.

- [ ] **Step 5: Write build scripts**

`prebuild.mjs` deletes `public/fixture-photos` unless `CONTENT_SOURCE=fixtures`. `postbuild.mjs` deletes `out/**/__none*`.

Next.js static export fails when `generateStaticParams` returns an empty array, and production starts empty. So dynamic pages return `paramsOrPlaceholder(realParams, { slug: PLACEHOLDER_SLUG })`, call `notFound()` on the placeholder, and `postbuild.mjs` removes its output.

- [ ] **Step 6: Build the header, homepage shell, and 404**

Add `SiteHeader` with the logo linking to `/`, and `events`, `tags`, `about` linking to `/`, `/tags/`, and `/about/`. Hover underlines are gated by `@media (hover: hover) and (pointer: fine)`. Add a visible `:focus-visible` style, palette-matched text selection, and `No photos yet.` when there are no events. The 404 says `Page not found.` and links to `/`.

- [ ] **Step 7: Verify tests and both builds**

Run: `pnpm --filter web test`
Expected: PASS.

Run: `pnpm --filter web fixtures && CONTENT_SOURCE=fixtures pnpm --filter web build`
Expected: build succeeds and `apps/web/out/fixture-photos` exists.

Run: `pnpm --filter web build && test ! -d apps/web/out/fixture-photos`
Expected: build succeeds with an empty homepage, no `fixture-photos`, and no `__none` output.

### Task 3: Photo component and gallery pages

**Files:**
- Create: `apps/web/src/components/Photo.tsx`, `PhotoRows.tsx`, `PageHeading.tsx`
- Create: `apps/web/src/lib/sizes.ts`
- Create: `apps/web/src/app/events/[event]/page.tsx`, `tags/page.tsx`, `tags/[tag]/page.tsx`, `about/page.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Test: `apps/web/src/lib/sizes.test.ts`, `apps/web/e2e/gallery.spec.ts`, `apps/web/playwright.config.ts`

**Interfaces:**
- Consumes: Task 1 `buildRows`, `ratioOf`, `getCover`, `getTags`, `getPhotosByTag`; Task 2 loaders.
- Produces:
  - `<Photo event={string} photo={ResolvedPhoto} sizes={string} priority={boolean} className?={string} />`
  - `<PhotoRows items={RowItem[]} priorityFirstRow={boolean} />`, where `RowItem = { event: string; photo: ResolvedPhoto; href: string; caption?: { title: string; detail: string } }`
  - `rowSizes(ratio: number, rowRatio: number): string`

- [ ] **Step 1: Write failing tests**

`rowSizes(1.5, 3)` returns `"(min-width: 640px) 50vw, 100vw"`.

Configure Playwright with projects at 1440×900 and 390×844, serving `apps/web/out` on port 4173 with `serve`. E2E tests, using a fixture build:
- `homepage shows events newest first`: the first title is the long event, followed by `Wet Night Downtown` and `Morning Fog`
- `event photos keep their ratio`: on `/events/morning-fog/`, each image's rendered ratio is within 1% of its width and height attributes
- `rows share one height on laptop` and `each photo is full width on phone`
- `photos reserve space without JavaScript`: with JavaScript disabled, every photo has non-zero size and lazy photos are not hidden
- `tag page spans events`: `/tags/nature/` includes photos from both `wet-night-downtown` and `morning-fog`
- `no horizontal scrolling`: on every route, `scrollWidth <= clientWidth`
- `about hides empty fields`: an empty Instagram URL renders no link

Fixture generation writes `content/fixtures/site.json` with a sample bio and a blank Instagram URL.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter web test:e2e`
Expected: FAIL. This script generates fixtures, builds with `CONTENT_SOURCE=fixtures`, and runs Playwright.

- [ ] **Step 3: Implement `Photo`**

A small client component. It renders `<picture>` with an AVIF and a WebP source using `photo.widths`, explicit `width` and `height`, `alt`, and the placeholder as its background image.

- Priority photos use `loading="eager"` and `fetchpriority="high"`, and never fade.
- Others use `loading="lazy"`. Under `.js`, they start at opacity 0 and move to 1 over 200ms once `data-loaded` is set. Set it in `onLoad`, and in an effect when `img.complete` is already true.
- Under `prefers-reduced-motion`, the change has no transition.

- [ ] **Step 4: Implement `PhotoRows` and pages**

Each row is a flex container with a 24px gap. Each item uses `flex: <ratio * 100> 1 0` and `aspect-ratio: <ratio>`. Below 640px, rows stack with a 12px gap. A row whose total ratio is under 2 gets a max height of `calc(100svh - 58px - 24px)`, with width following from its ratio.

Pages:
- **Homepage:** one row item per event cover, linking to the event. The caption is the title plus `August 17, 2026 · 22 photos`, on the scrim. Use `1 photo` for a single photo.
- **Event:** `PageHeading` with title, date, count, and tag links, above rows linking to photo pages. Use `paramsOrPlaceholder`.
- **Tag index:** tag links with counts. **Tag page:** tag as the title, count, and rows.
- **About:** `about` heading, bio, and Instagram link, hiding empty fields.

Format dates as `en-US` in UTC, so builds don't shift the day by time zone. Use `generateMetadata` for titles and descriptions, and Open Graph tags from the page's first photo.

- [ ] **Step 5: Run tests**

Run: `pnpm --filter web test && pnpm --filter web test:e2e`
Expected: PASS.

- [ ] **Step 6: Check the render**

Screenshot `/` and `/events/morning-fog/` at both viewport sizes, and compare with the approved mockup at `.superpowers/brainstorm/623-1793864284/content/ratio-3-2-layouts.html`.
Expected: same margins, type, and row behavior, with no large empty areas.

### Task 4: Photo page

**Files:**
- Create: `apps/web/src/app/events/[event]/[photo]/page.tsx`
- Create: `apps/web/src/components/ExifList.tsx`, `PhotoControls.tsx`, `PhotoThumbs.tsx`, `CopyLink.tsx`, `PhotoGestures.tsx`, `icons.tsx`
- Create: `apps/web/src/lib/swipe.ts`, `share.ts`
- Test: `apps/web/src/lib/swipe.test.ts`, `share.test.ts`, `apps/web/e2e/photo.spec.ts`

**Interfaces:**
- Consumes: Task 1 `getAdjacentPhotos`, `ratioOf`; Task 2 `getEvent`, `getSiteUrl`, `photoUrl`; Task 3 `Photo`.
- Produces:
  - `classifySwipe(input: { dx: number; dy: number; ms: number }): "prev" | "next" | null`
  - `dampedOffset(dx: number, atEnd: boolean): number`
  - `sharePhotoUrl(event: string, photo: ResolvedPhoto): string`

- [ ] **Step 1: Write failing unit tests**

- `classifySwipe({ dx: -90, dy: 5, ms: 500 })` is `"next"` and `dx: 90` is `"prev"` (distance threshold 80px)
- `classifySwipe({ dx: -30, dy: 2, ms: 100 })` is `"next"` (velocity above 0.11 px/ms)
- `classifySwipe({ dx: -30, dy: 2, ms: 1000 })` is `null`
- `classifySwipe({ dx: -90, dy: 120, ms: 200 })` is `null` (mostly vertical)
- `classifySwipe({ dx: -5, dy: 0, ms: 10 })` is `null` (minimum 10px)
- `dampedOffset(100, true)` is `30`, and `dampedOffset(100, false)` is `100`
- `sharePhotoUrl` picks the 1600 WebP when available, and the largest width for a 1200-only photo

- [ ] **Step 2: Write failing E2E tests**

- `landscape layout`: at 1440×900, `/events/morning-fog/01/` shows the whole photo and whole EXIF row within the viewport, with the photo left of the panel
- `portrait layout`: `/events/morning-fog/02/` shows the whole photo in the viewport, with the EXIF grid beside it
- `phone layout`: the photo comes before the title, at full width
- `square and panorama fit`: `05` and `06` stay uncropped and fully inside the viewport on laptop
- `arrow keys move within the event`: Right goes from `01` to `02`, and Left returns
- `first and last have no dead ends`: `01` has no previous link and Left stays put; `06` has no next link and Right stays put
- `one-photo event has neither control`
- `modified keys are ignored`: Alt+Left and Ctrl+Left don't trigger site navigation
- `Escape returns to the event`
- `swipe changes photos on touch`, in a touch-enabled context
- `empty EXIF is hidden`: `wet-night-downtown/04` shows only ISO, and the long event's photo shows no EXIF block
- `copy link`: with clipboard permission, clipboard holds the page URL and `Copied` appears
- `copy link failure`: with `navigator.clipboard.writeText` stubbed to reject, `Couldn't copy link` appears
- `share tags`: `og:image` ends in `-1600.webp`, and `-1200.webp` on the 1200-only photo
- `controls work without JavaScript`: the next link navigates with JavaScript disabled

- [ ] **Step 3: Run to verify they fail**

Run: `pnpm --filter web test && pnpm --filter web test:e2e`
Expected: FAIL on the new tests.

- [ ] **Step 4: Implement helpers and components**

`PhotoControls` renders previous and next as real links with SVG icons and accessible names, plus `CopyLink`. `PhotoThumbs` uses CSS columns with original ratios, labels each link `Photo N of M`, and marks the current link with `aria-current="page"`. `ExifList` takes `layout: "row" | "grid"` and renders nothing if all fields are empty.

`PhotoGestures` is a client wrapper around the photo:
- It uses `router.push` for ArrowLeft and ArrowRight, and returns to the event on Escape, with no transition.
- It ignores keys with Alt, Ctrl, Meta, or Shift.
- For touch, it uses pointer capture, ignores any pointer after the first, moves the photo using `dampedOffset`, navigates using `classifySwipe`, and otherwise returns it with a `transform` transition of 200ms using `cubic-bezier(0.23, 1, 0.32, 1)`. Under `prefers-reduced-motion`, it skips drag movement and transition but still navigates.

- [ ] **Step 5: Implement the page layout**

Orientation: a ratio of 1 or more is landscape.

Landscape at 1024px and wider:

```css
.photo-frame {
  width: min(
    calc(100vw - 72px - 240px),
    calc((100svh - 58px - 24px - 72px) * var(--ratio))
  );
}
```

The 72px height holds the EXIF row, and the side panel uses `flex: 1 1 240px`. Panoramic photos below this width follow the same rule.

Portrait at 1024px and wider: the photo height is `calc(100svh - 58px - 24px)`, and the panel fills the remaining width with a 3-by-2 EXIF grid.

On laptops, the panel uses `overflow-y: auto`. Thumbnail columns are 2 under 360px of panel width, 4 up to 800px, and 6 above that, using a container query. Below 1024px, the layout is one column with 12px margins, a 3-by-2 EXIF grid, and 3 thumbnail columns.

The main photo uses `priority`. Its `sizes` is `(min-width: 1024px) calc(100vw - 312px), 100vw` for landscape, and `(min-width: 1024px) 50vw, 100vw` for portrait. Thumbnails use `sizes="240px"`. Set `og:image` from `sharePhotoUrl`, made absolute with `getSiteUrl`.

- [ ] **Step 6: Run tests**

Run: `pnpm --filter web test && pnpm --filter web test:e2e`
Expected: PASS.

- [ ] **Step 7: Check the render**

Screenshot landscape, portrait, square, and panorama photos at 1440×900, 1920×1080, and 390×844, and compare with the mockup.
Expected: no large empty areas at 1440×900. At 1920×1080, the panel uses the extra width with more thumbnails.

### Task 5: Accessibility, performance, and CI

**Files:**
- Create: `apps/web/e2e/a11y.spec.ts`, `lighthouserc.json`, `.github/workflows/ci.yml`, `README.md`
- Modify: root and `apps/web` `package.json`

**Interfaces:**
- Consumes: the finished site and `test:e2e`.

- [ ] **Step 1: Write the accessibility test**

Run `@axe-core/playwright` on `/`, an event page, a landscape and a portrait photo page, `/tags/`, a tag page, `/about/`, and the 404. Expect no violations. Exclude only `color-contrast` for captions and credits on photos, because axe can't measure text over an image. The owner's brightest photos are checked by eye before launch.

Also assert: tabbing reaches the logo, navigation, and photo controls, and the focused element has a visible outline.

- [ ] **Step 2: Run it and fix violations**

Run: `pnpm --filter web test:e2e`
Expected: PASS after fixes.

- [ ] **Step 3: Configure Lighthouse CI**

Use `staticDistDir: "apps/web/out"`, with `/`, `/events/morning-fog/`, and `/events/morning-fog/01/`. Default mobile throttling simulates 4G. Assert `largest-contentful-paint` at most 2500ms, `cumulative-layout-shift` at most 0.1, and category scores of at least 0.9 for accessibility and performance.

- [ ] **Step 4: Run it**

Run: `pnpm --filter web test:lighthouse`
Expected: PASS. Fixture gradients compress better than real photos, so re-check this once real photos exist.

- [ ] **Step 5: Add CI and README**

CI runs on pushes and pull requests with Node 22 and pnpm 9.12.2: lint, typecheck, unit tests, E2E, Lighthouse, and the production empty build with its `fixture-photos` check. It stays inactive until the repo exists.

The README covers what the project is, how to run it, the content folder, and the fixture command. Leave the demo link and privacy test for the later phases that add them.

- [ ] **Step 6: Run everything**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm --filter web test:e2e && pnpm --filter web test:lighthouse && pnpm --filter web build && test ! -d apps/web/out/fixture-photos`
Expected: every command passes.
