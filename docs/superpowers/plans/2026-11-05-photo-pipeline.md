# Photo Pipeline and Privacy Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn exported JPEGs in `originals/<event>/` into the public images and event JSON the site already reads, and fail the build on any location leak.

**Architecture:** A new Node-only package, `@gallery/photos`, holds EXIF reading, draft handling, rendering, publishing, and the privacy check behind a small CLI. It validates its output with `eventSchema` from `@gallery/core`, so the site needs no pipeline-specific code.

**Tech Stack:** TypeScript strict, sharp, exiftool-vendored, tsx, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-05-photo-pipeline-design.md`

## Global Constraints

- No git commands against the project. There is no repo yet, and the owner handles git later. A throwaway `git init` inside a test's temp folder is fine.
- No test opens a browser. Don't run Playwright or Lighthouse in this plan: they opened many windows and lagged the owner's laptop. The one web check is `next build`.
- `packages/photos/vitest.config.ts` sets `maxWorkers: 1` and `testTimeout: 60000`.
- Render settings are `sharp.concurrency(2)`, `sharp.cache(false)`, and one photo at a time.
- Widths: 640, 1024, 1600, 2400. Formats: AVIF quality 50, effort 4, and WebP quality 75.
- Output names: `<photosDir>/<slug>/<id>-<width>.<avif|webp>` and `<contentDir>/<slug>.json`.
- Originals are read-only. No code writes to a source photo.
- Node floor is 22, and `sharp` stays on the version `apps/web` uses (`^0.35.5`).

## Review Focus

1. A folder holding `desktop.ini`, `Thumbs.db`, or `.JPG` in capitals: system files are ignored, and extensions match in any case. Pinned in Task 3.
2. `event.json` saved with a BOM by a Windows editor: it still parses. Pinned in Task 3.
3. A photo taken near midnight: `exif.date` is the date the camera wrote, with no timezone shift. A camera's empty `0000:00:00` date becomes no date. Pinned in Task 2.
4. A swap blocked for a moment by Defender or the dev server (`EPERM`, `EBUSY`): it retries, then fails with the published event intact. Pinned in Task 5.
5. A real path containing spaces, as the repo's own path does: every step works. All temp folders in tests contain a space. Pinned in Tasks 2 to 6.

---

### Task 1: Package setup and strict schema

**Files:**
- Create: `packages/photos/package.json`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts`, `src/test-utils.ts`
- Modify: `package.json`, `packages/core/src/schema.ts`, `packages/core/src/schema.test.ts`, `apps/web/src/lib/content.ts`, `apps/web/package.json`
- Create: `content/empty/site.json`

**Interfaces:**
- Produces: `tempDir(): Promise<string>` in `test-utils.ts`, which returns a new folder whose name contains a space and is removed after the test.

- [ ] **Step 1: Write failing schema tests in `schema.test.ts`**

```ts
it("rejects an unknown key on a photo", () => {
  const bad = event({ photos: [{ ...photo("01"), gps: "1,1" }] });
  expect(eventSchema.safeParse(bad).success).toBe(false);
});
it("rejects an unknown key on an event", () => {
  expect(eventSchema.safeParse({ ...event(), latitude: 1 }).success).toBe(false);
});
it("rejects an unknown key on the site", () => {
  expect(siteSchema.safeParse({ bio: "", instagramUrl: "", gps: "1,1" }).success).toBe(false);
});
```

- [ ] **Step 2: Run them**

Run: `pnpm --filter @gallery/core test`
Expected: the 3 new tests FAIL, because the keys are stripped.

- [ ] **Step 3: Make `photoSchema`, `eventSchema`, and `siteSchema` use `z.strictObject`**

- [ ] **Step 4: Run core and web unit tests**

Run: `pnpm --filter @gallery/core test; pnpm --filter web test`
Expected: PASS. Fixtures already use only known keys.

- [ ] **Step 5: Keep the empty build check working once real events exist**

`test:empty` builds with `content/events`, which will soon hold real events. Add `content/empty/site.json` containing `{"bio":"","instagramUrl":""}`. In `content.ts`, make `contentRoot` resolve `CONTENT_SOURCE=empty` to `content/empty`. Change the script to `cross-env CONTENT_SOURCE=empty pnpm build && node scripts/check-empty-build.mjs`.

Run: `pnpm --filter web test:empty`
Expected: `Empty production build is clean.` Then run `pnpm --filter web fixtures`, because this build removes fixture photos.

- [ ] **Step 6: Scaffold `packages/photos` and install**

Mirror `packages/core` for `package.json` and `tsconfig.json`. Dependencies are `@gallery/core`, `sharp`, and `exiftool-vendored`. Add `tsx` to the root dev dependencies. Add root scripts `"photos": "tsx packages/photos/src/cli.ts photos"` and `"test:privacy": "tsx packages/photos/src/cli.ts privacy"`.

Run: `pnpm install; pnpm --filter @gallery/photos typecheck`
Expected: both succeed.

### Task 2: EXIF allow-list

**Files:**
- Create: `packages/photos/src/exif.ts`, `exif.test.ts`

**Interfaces:**
- Consumes: `tempDir`
- Produces:
  - `mapExif(tags: Record<string, unknown>): Photo["exif"]`, pure
  - `readTags(file: string): Promise<Record<string, unknown>>`
  - `readExif(file: string): Promise<Photo["exif"]>`
  - `closeExif(): Promise<void>`, which ends the shared `new ExifTool({ maxProcs: 1 })`
  - `writeTestTags(file: string, tags: Record<string, unknown>): Promise<void>`, exported from `test-utils.ts`

- [ ] **Step 1: Write failing tests**

```ts
const tags = {
  DateTimeOriginal: "2026:08:17 23:58:00",
  Make: "FUJIFILM", Model: "X-T5", LensModel: "XF23mmF1.4 R LM WR",
  FocalLength: "23.0 mm", FNumber: 5.6, ExposureTime: "1/250", ISO: 200,
};
it("maps each allowed field", () =>
  expect(mapExif(tags)).toEqual({
    date: "2026-08-17", camera: "Fujifilm X-T5", lens: "XF23mmF1.4 R LM WR",
    focalLength: "23mm", aperture: "f/5.6", shutter: "1/250s", iso: 200,
  }));
it("doesn't repeat a brand already in the model", () =>
  expect(mapExif({ Make: "Canon", Model: "Canon EOS R6" }).camera).toBe("Canon EOS R6"));
it("keeps the date the camera wrote, near midnight", () =>
  expect(mapExif({ DateTimeOriginal: "2026:08:17 23:58:00+07:00" }).date).toBe("2026-08-17"));
it("treats an unset camera date as no date", () =>
  expect(mapExif({ DateTimeOriginal: "0000:00:00 00:00:00" }).date).toBeUndefined());
it("copies nothing outside the allow-list", () =>
  expect(mapExif({ GPSLatitude: 1, SerialNumber: "A", OwnerName: "B" })).toEqual({}));
it("reads a real file in a folder with a space", async () => {
  // Generates a JPEG with sharp, tags it with writeTestTags, then calls readExif.
});
```

Make `mapExif` accept `ExifDateTime` as well as strings. Read the written text through `rawValue`, never through `toDate()`, which would shift the timezone.

- [ ] **Step 2: Run them**

Run: `pnpm --filter @gallery/photos test`
Expected: FAIL, because `mapExif` isn't defined.

- [ ] **Step 3: Implement `exif.ts`**

Title-case an all-caps `Make`, and show whole focal lengths without decimals, such as `23mm`.

- [ ] **Step 4: Run them**

Run: `pnpm --filter @gallery/photos test`
Expected: PASS.

### Task 3: Draft file

**Files:**
- Create: `packages/photos/src/draft.ts`, `draft.test.ts`

**Interfaces:**
- Consumes: `readExif`
- Produces:
  - `type Draft = { title: string; date: string; coverPhotoId: string; photos: DraftPhoto[] }`
  - `type DraftPhoto = { file: string; id: string; alt: string; tags: string[]; exif: Photo["exif"] }`
  - `listPhotoFiles(dir: string): string[]`, which keeps `.jpg` and `.jpeg` in any case, sorted by file name
  - `findUnsupported(dir: string): string[]`, for other files, ignoring `event.json`, `.photos-cache.json`, `desktop.ini`, `Thumbs.db`, and dotfiles
  - `readDraft(dir: string): Draft | undefined`, which strips a BOM and names the file in a parse error
  - `syncDraft(dir: string): Promise<{ draft: Draft; created: boolean; added: string[]; noExif: string[] }>`, which writes `event.json`
  - `draftProblems(draft: Draft, dir: string): string[]`
  - `toEvent(slug: string, draft: Draft, photos: Map<string, { width: number; height: number; placeholder: string }>): Event`, which ends with `eventSchema.parse`

- [ ] **Step 1: Write failing tests**

Test names, each asserting what it states:

- `creates a draft sorted by file name, with ids 01, 02, 03`
- `starts the event date at the earliest photo date, and the cover at the first photo`
- `matches .JPG in capitals`
- `ignores desktop.ini, Thumbs.db, and its own files`
- `reports a RAW file as unsupported`
- `reads a draft saved with a BOM`
- `keeps ids and order when entries were reordered`
- `appends a new file with the next unused id, and keeps every edit`
- `doesn't reuse a removed id`: IDs 01, 02, 03 with 03 removed, then a new file takes `04`. The highest ID ever used is kept in `.photos-cache.json`.
- `reports files with no EXIF`
- `lists an empty title and each empty alt`
- `lists a draft entry with no file, and a file with no entry`
- `rejects a bad tag or date with the field named`
- `toEvent output leaves out the file name`: asserts `JSON.stringify(event)` doesn't contain `_DSF0011`.

- [ ] **Step 2: Run them**

Run: `pnpm --filter @gallery/photos test`
Expected: FAIL, because `syncDraft` isn't defined.

- [ ] **Step 3: Implement `draft.ts`**

Format IDs with at least two digits. Write the draft with 2-space JSON.

- [ ] **Step 4: Run them**

Run: `pnpm --filter @gallery/photos test`
Expected: PASS.

### Task 4: Rendering and watermark

**Files:**
- Create: `packages/photos/src/render.ts`, `render.test.ts`, `packages/photos/assets/watermark.svg`, `packages/photos/assets/AdobeCompat-v2.icc`, `packages/photos/assets/LICENSES.md`

**Interfaces:**
- Consumes: `readTags`, `tempDir`
- Produces:
  - `RENDER_VERSION: string`, which changes whenever render output changes
  - `isAdobeRgb(tags: Record<string, unknown>): boolean`
  - `renderPhoto(sourceFile: string, id: string, outDir: string): Promise<{ width: number; height: number; placeholder: string; widths: number[] }>`

- [ ] **Step 1: Prepare the assets**

Outline `© miaikoo` from Plus Jakarta Sans into SVG paths once, using a throwaway script outside the repo. `watermark.svg` has no font dependency, which is more reliable than the font file the spec first named. Download `AdobeCompat-v2.icc` from `saucecontrol/Compact-ICC-Profiles` (CC0). Record both licenses in `LICENSES.md`.

- [ ] **Step 2: Write failing tests**

Use generated images no wider than 3000px, with a noise or gradient background.

- `outputs AVIF and WebP at 640, 1024, 1600, and 2400 for a 3000px source`
- `skips widths larger than the source`: 1200px gives 640 and 1024.
- `gives a source narrower than 640 one file at its own width`
- `applies rotation, reporting portrait dimensions`: a 3000x2000 source with EXIF orientation 6 reports 2000x3000.
- `reports dimensions of the largest output, keeping the ratio`
- `leaves no metadata in any output`: all of the source's tags are absent according to `readTags`.
- `isAdobeRgb detects InteropIndex R03 and ColorSpace Uncalibrated, and not sRGB`
- `converts an Adobe RGB file with no profile`: the same pixels tagged `InteropIndex: R03` render with higher green saturation than untagged pixels, and an output pixel differs by more than 5 levels.
- `keeps an embedded profile rather than assuming Adobe RGB`
- `draws the watermark in the bottom right at every width`: compared with an unwatermarked resize at each width, the corner region differs by a mean above 3 levels and the top-left quarter differs by under 1.
- `keeps the watermark legible at 640`: its bounding box is at least 11px tall.
- `makes a placeholder from the unwatermarked image`: starts with `data:image/webp;base64,` and is 24px wide when decoded.

- [ ] **Step 3: Run them**

Run: `pnpm --filter @gallery/photos test`
Expected: FAIL, because `renderPhoto` isn't defined.

- [ ] **Step 4: Implement `render.ts`**

Sharp can't take an input profile. For an Adobe RGB file with no profile, insert the ICC profile into an in-memory copy as a JPEG APP2 segment right after the SOI marker, then give that buffer to sharp:

```text
FF E2 <2-byte length> "ICC_PROFILE\0" 01 01 <profile bytes>
```

Watermark scale: the text height is `max(13, width * 0.016)` px, and the margin is `max(10, width * 0.012)` px. Draw it at 80% opacity over a blurred dark copy at 45%. Never call `keepMetadata` or `withMetadata`.

- [ ] **Step 5: Run them**

Run: `pnpm --filter @gallery/photos test`
Expected: PASS.

### Task 5: Publishing

**Files:**
- Create: `packages/photos/src/publish.ts`, `publish.test.ts`

**Interfaces:**
- Consumes: `syncDraft`, `draftProblems`, `toEvent`, `findUnsupported`, `renderPhoto`, `RENDER_VERSION`
- Produces:
  - `type Paths = { contentDir: string; photosDir: string }`, where `contentDir` is the `content/events` folder
  - `type RunResult = { status: "draft-created" | "draft-updated" | "needs-edits" | "published"; messages: string[]; rendered: number; reused: number }`
  - `runEvent(sourceDir: string, paths: Paths): Promise<RunResult>`
  - `slugFromFolder(dir: string): string`, which accepts trailing slashes and backslashes, and throws with a suggested valid name
  - `swapWithRetry(from: string, to: string, rename?: typeof fs.rename): Promise<void>`

- [ ] **Step 1: Write failing tests**

- `first run creates the draft and publishes nothing`
- `a run with empty alt text returns needs-edits and lists each one`
- `a run after adding a photo returns draft-updated and publishes nothing`
- `a complete draft publishes files that loadEvents accepts`: parses the JSON with `eventSchema`, and checks every photo and width file exists.
- `reorders photos in the JSON without changing ids or files`
- `removes files of a photo taken out of the draft`
- `a second run re-encodes nothing`: `rendered` is 0.
- `a replaced source file is re-encoded`
- `a missing published file is re-encoded`
- `a corrupt photo fails and leaves the previous event untouched`
- `an unsupported file fails with its name and publishes nothing`
- `swapWithRetry retries EPERM and EBUSY, then succeeds`
- `swapWithRetry rethrows after its attempts, keeping the old folder`: up to 5 attempts, 300ms apart.
- `suggests a valid slug for a bad folder name`: `Bromo Trip` suggests `bromo-trip`.
- `keeps originals byte for byte`: their hashes are unchanged after publishing.

- [ ] **Step 2: Run them**

Run: `pnpm --filter @gallery/photos test`
Expected: FAIL, because `runEvent` isn't defined.

- [ ] **Step 3: Implement `publish.ts`**

Build everything in `<photosDir>/.tmp-<slug>`, copying files of unchanged photos from the published folder. Validate through `toEvent`, swap the folder, then write the JSON through a temp file and rename. The cache maps each photo ID to a SHA-256 of the source plus `RENDER_VERSION`. Process photos sequentially.

- [ ] **Step 4: Run them**

Run: `pnpm --filter @gallery/photos test`
Expected: PASS.

### Task 6: Privacy check and leak test

**Files:**
- Create: `packages/photos/src/privacy.ts`, `privacy.test.ts`, `leak.test.ts`

**Interfaces:**
- Consumes: `readTags`, `runEvent`, `writeTestTags`, `tempDir`
- Produces: `checkPrivacy(root: { photosDir: string; contentRoot: string; repoRoot: string }): Promise<string[]>`, which returns problems and is empty when clean.

- [ ] **Step 1: Write failing tests in `privacy.test.ts`**

- `passes on an empty site`
- `passes on files the pipeline made`
- `fails on an image with EXIF, XMP, IPTC, or GPS`: one case each, naming the file.
- `fails on a stray JPEG`
- `fails on a gps key at any depth in content JSON`, with cases `gps`, `GPSLatitude`, `latitude`, and `longitude`
- `reads content/fixtures and content/empty as well as events`
- `fails when a file under originals is tracked by git`: uses `git init` and `git add -f` in the test's temp folder.
- `skips the git check outside a repo`

- [ ] **Step 2: Write the failing leak test in `leak.test.ts`**

```ts
it("drops GPS, serial number, and owner name from everything published", async () => {
  // Source JPEG tagged with GPSLatitude, GPSLongitude, SerialNumber, OwnerName, Artist.
  const before = await readTags(source);
  expect(before.GPSLatitude).toBeDefined(); // Otherwise this test proves nothing.
  // Fill in the draft, then runEvent.
  for (const file of allOutputFiles) {
    const tags = await readTags(file);
    for (const key of ["GPSLatitude", "GPSLongitude", "SerialNumber", "OwnerName", "Artist"]) {
      expect(tags[key]).toBeUndefined();
    }
    expect(readFileSync(file).includes("Secret Owner")).toBe(false);
  }
  const json = readFileSync(eventJson, "utf8");
  expect(json).not.toMatch(/gps|latitude|Secret Owner|SERIAL123/i);
  expect(await checkPrivacy(paths)).toEqual([]);
});
```

- [ ] **Step 3: Run them**

Run: `pnpm --filter @gallery/photos test`
Expected: FAIL, because `checkPrivacy` isn't defined.

- [ ] **Step 4: Implement `privacy.ts`**

Read tags with exiftool's `-G0` grouping. A problem is any tag in the groups `EXIF`, `XMP`, `IPTC`, `GPS`, `MakerNotes`, or `Photoshop`, or any tag name matching `/gps|serial|owner|artist|creator|copyright/i`. Also scan each file's bytes for `Exif\0\0` and `<x:xmpmeta`, so the check doesn't rest on one tool. Check that the tool sees real metadata through the tests above, not just that it returns nothing.

- [ ] **Step 5: Run them**

Run: `pnpm --filter @gallery/photos test`
Expected: PASS.

### Task 7: CLI, CI, docs, and the owner's real photos

**Files:**
- Create: `packages/photos/src/cli.ts`, `cli.test.ts`
- Modify: `packages/photos/src/index.ts`, `.github/workflows/ci.yml`, `README.md`, `DESIGN.md`

**Interfaces:**
- Consumes: `runEvent`, `checkPrivacy`, `closeExif`
- Produces: `main(argv: string[], repoRoot: string, log: (line: string) => void): Promise<number>`, which returns an exit code.

- [ ] **Step 1: Write failing tests in `cli.test.ts`**

- `photos with no folder prints usage and returns 1`
- `photos on a missing folder names it and returns 1`
- `photos accepts a relative path with a trailing slash`
- `draft-created and needs-edits print what to do next and return 0`
- `privacy returns 1 and prints each problem, and 0 when clean`
- `always closes exiftool, including after an error`

- [ ] **Step 2: Run them**

Run: `pnpm --filter @gallery/photos test`
Expected: FAIL, because `main` isn't defined.

- [ ] **Step 3: Implement `cli.ts`**

Paths resolve against the repo root: `content/events`, `apps/web/public/photos`, and `content`. Print each photo as it finishes, because AVIF encoding of large photos takes a while.

- [ ] **Step 4: Update CI and docs**

Add `- run: pnpm test:privacy` after `pnpm test` in `ci.yml`. Document the workflow, export settings, and privacy check in `README.md`. Under Do's in `DESIGN.md`, note that the watermark scales per width.

- [ ] **Step 5: Run every non-browser check**

Run: `pnpm lint; pnpm typecheck; pnpm test; pnpm test:privacy`
Expected: all pass, and privacy reports a clean site.

- [ ] **Step 6: Create the owner's real drafts**

Run: `pnpm photos originals/fam-bromo-trip; pnpm photos originals/jember-scav-hunt`
Expected: two `event.json` files are created and nothing is published. Report which files read as Adobe RGB, and whether any contain GPS, as yes or no only. Never print coordinates. Stop here: the owner writes titles and alt text.

- [ ] **Step 7: Publish after the owner fills in the drafts**

Run the same commands, then `pnpm test:privacy` and `pnpm --filter web build`.
Expected: `published`, privacy is clean, and the build succeeds. Report the total MB per photo against the PRD's estimate of about 1 MB. The owner checks the watermark and colors in their own browser.
