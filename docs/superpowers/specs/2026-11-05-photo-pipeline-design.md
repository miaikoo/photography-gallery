# Photo Pipeline and Privacy Check Design

## Goal

Turn the owner's exported JPEGs into the public image files and event data the site already reads, and make a location leak fail the build.

The site reads `content/events/<slug>.json` and `apps/web/public/photos/<slug>/<id>-<width>.<avif|webp>`. Nothing in `apps/web` changes except the stricter schema it inherits.

## Scope

**In scope**

- A command that creates and publishes one event from one folder
- EXIF copied through an allow-list
- Watermark, resizing, sRGB conversion, and metadata removal
- A privacy check for CI and manual runs
- Strict schema keys at every level

**Out of scope**

- The upload app (`apps/studio`), which will call this package later
- Adjusting watermark position and opacity, which needs a preview
- Drag and drop ordering
- Git setup and deployment

## Where the code lives

New package `packages/photos`, named `@gallery/photos`.

It can't go in `@gallery/core`, because `PhotoThumbs`, a client component, imports from core. `sharp` and `exiftool-vendored` are native, Node-only packages and would break that bundle.

| Module | Job |
| --- | --- |
| `exif.ts` | Reads a file with exiftool and maps allowed fields to the site's `exif` shape |
| `draft.ts` | Creates, merges, and validates `event.json` |
| `render.ts` | Produces one photo's public files and placeholder |
| `publish.ts` | Writes one event's output, replacing the previous output as a whole |
| `privacy.ts` | Checks public images and content JSON |
| `cli.ts` | `photos` and `privacy` commands |

## Owner workflow

Folder names become event URLs, so they must match the existing slug rule.

```text
originals/
  fam-bromo-trip/
    _DSF0011.JPG
    event.json        created by the command
```

1. `pnpm photos originals/fam-bromo-trip` finds no `event.json`, so it creates one and stops.
2. The owner fills in the title, alt text, tags, and cover, and corrects anything wrong.
3. The same command finds a complete draft and publishes the event.

Running the command again after adding photos appends them to the draft and stops, so the new photos can be completed. It never overwrites the owner's edits.

## The draft file

```json
{
  "title": "",
  "date": "2026-08-17",
  "coverPhotoId": "01",
  "photos": [
    {
      "file": "_DSF0011.JPG",
      "id": "01",
      "alt": "",
      "tags": [],
      "exif": { "date": "2026-08-17", "camera": "Fujifilm X-T5", "iso": 200 }
    }
  ]
}
```

- `photos` starts sorted by file name. Its order is the event's order, so the owner reorders by moving entries.
- `id` is assigned once and kept, so reordering never changes a photo's URL. New photos take the next unused number, and removed numbers aren't reused.
- `date` starts as the earliest photo date.
- `coverPhotoId` starts as the first photo.
- `file` never reaches the site, so camera file names stay private.

Publishing refuses to run and lists every problem when:

- the title or any alt text is empty
- a photo in the draft has no file, or a file has no draft entry
- a date, tag, or ID doesn't match the site's schema

The output is validated with `eventSchema` before anything is replaced.

## EXIF

Fields are copied only through this allow-list. There is no general copy step, so GPS, serial numbers, and owner names have no path to the site.

| Site field | Source | Example |
| --- | --- | --- |
| `date` | `DateTimeOriginal`, date part only | `2026-08-17` |
| `camera` | `Make` and `Model`, without a repeated brand | `Fujifilm X-T5` |
| `lens` | `LensModel` | `XF 23mm F1.4` |
| `focalLength` | `FocalLength` | `23mm` |
| `aperture` | `FNumber` | `f/5.6` |
| `shutter` | `ExposureTime` | `1/250s` |
| `iso` | `ISO` | `200` |

A missing field stays out of the draft, and the site already hides empty fields. Edits change only `event.json`, never the original.

## Rendering

Each photo is processed in this order:

1. Read the original and apply its rotation.
2. Convert to sRGB. A file tagged Adobe RGB in its EXIF but carrying no ICC profile is converted as Adobe RGB, so its colors don't shift.
3. Resize to each width in 640, 1024, 1600, and 2400. Widths larger than the original are skipped. A photo narrower than 640 gets one file at its own width.
4. Draw the watermark on that resized image, so it stays legible at every size.
5. Encode AVIF and WebP with no metadata.

**Watermark.** The text is `© miaikoo` at the bottom right, in Plus Jakarta Sans. Its size and margin scale with the image width, with a minimum size for 640px files. White text at 80% opacity with a soft dark shadow stays readable on both sky and shadow. The text is committed as outlined SVG paths, so output doesn't depend on installed fonts.

**Placeholder.** A 24px wide blurred WebP data URL made from the unwatermarked image, because the mark wouldn't survive at that size.

**Dimensions.** `width` and `height` come from the largest output, after rotation. The site's layout depends on these being accurate.

**Laptop load.** Photos are processed one at a time with a capped number of `sharp` threads, so the laptop stays usable. An unchanged photo isn't encoded again: a cache file next to the draft records a hash of the source and the render settings.

**Replacing output.** An event's files are written to a temporary folder and swapped in once all of them succeed, so a failed run leaves the published event untouched. Photos removed from the draft disappear with the swap.

## Privacy check

`pnpm test:privacy` fails on any of these:

| Check | Fails when |
| --- | --- |
| Public images | Any file under `apps/web/public/photos` carries EXIF, XMP, IPTC, GPS, or maker data, as read by exiftool |
| Unknown image types | That folder holds anything other than `.avif` and `.webp` |
| Content data | Any key in `content/**/*.json` is named like location data, such as `gps`, `latitude`, or `longitude`, at any depth |
| Originals | A file under `originals/` is tracked by git, once a repo exists |

The check reads everything already on disk, not only the latest output, and it passes on an empty site.

**Schema.** Today only `exif` rejects unknown keys. A `gps` key elsewhere on a photo is silently dropped from what the site reads, yet stays in the public JSON. `photoSchema`, `eventSchema`, and `siteSchema` all become strict, so that JSON fails the build.

## Failure handling

| Situation | Result |
| --- | --- |
| Unsupported or corrupt file, such as RAW or anything other than JPEG | Named in the error, nothing published |
| Folder name isn't a valid slug | Error suggests a valid name |
| No EXIF in a file | Draft is created with empty `exif`, and the command says which files |
| Invalid `event.json` | Error names the field, and the file isn't rewritten |
| Original smaller than 2400px | Published with fewer widths, and the command says so |

## Testing

All tests run in Vitest, using generated test images. None of them open a browser.

- **The leak test:** a generated JPEG carrying GPS, a serial number, and an owner name goes through the real pipeline. The test first confirms exiftool can read those tags from the input, then confirms that no output file and no JSON contains them.
- **Privacy check:** it must fail when given an image with metadata, a stray JPEG, or JSON with a `gps` key.
- **Schema:** unknown keys are rejected at the photo, event, and site levels.
- **EXIF mapping:** each field, missing fields, repeated camera brands, and a photo with no EXIF.
- **Draft:** creation order, stable IDs after reordering, appending new photos without losing edits, and each refusal listed above.
- **Rendering:** rotated originals, portrait dimensions, skipped widths, and output with no metadata.
- **Watermark:** the bottom right corner differs from the unwatermarked render at every width, and the rest of the image doesn't.
- **Replacing output:** a failure partway leaves the previous files in place, and a second run re-encodes nothing.

The real photos get one manual check: the owner looks at the published event on the site, including the watermark on bright and dark corners. That is also when actual file sizes get compared against the PRD's estimate of about 1 MB per photo.

## Decisions

- **Draft file before the upload app.** A form needs the whole studio app. The draft gives the same control now, and the studio can later write the same file.
- **exiftool for reading, `sharp` for writing.** This follows the PRD. Output has no metadata because `sharp` drops it by default, and the privacy check confirms that independently, using a different tool from the one that wrote the files.
- **Fixed watermark for now.** The PRD's position and opacity settings wait for the studio, because adjusting them without a preview is guesswork.
