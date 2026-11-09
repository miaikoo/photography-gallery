---
name: miaikoo
description: A personal street and nature photo gallery, with prints set close together on white.
---

<!-- SEED: established with the user before implementation; re-run /impeccable document once there's code to capture the actual tokens and components. -->

# Design System: miaikoo

Status as of November 5, 2026: no code exists yet. Values come from the mockups reviewed with the owner. Product scope lives in `PRD.md`.

## Overview

**Creative North Star: "Prints on a White Wall"**

The photos are the page. They sit close together on plain white, large enough to fill the screen, with just enough margin to stop the page feeling crammed. The type is warm and a little quirky, so the site reads as one person's collection rather than a newspaper or a template.

The owner rejected two things during review: airy layouts with large empty areas, and rigid condensed all-caps headlines. Treat both as firm.

Most photos are 3:2 or 2:3, so layouts are tuned for those two ratios. Other ratios must still display uncropped.

**Key Characteristics:**

- White pages, with photos filling nearly all of the space.
- 24px margins on laptop and 12px on phone.
- Square photo corners and no shadows.
- Fraunces titles, set in sentence or title case.
- A small `© miaikoo` credit on every public image.
- All site copy in English, with lowercase navigation.

## Colors

A neutral palette with no accent color, so nothing competes with the photos.

### Neutral

- **Page White** (#FFFFFF): every page background and all margins between photos.
- **Ink** (#161615): logo, page titles, and EXIF values.
- **Muted Stone** (#5F5F5A): navigation, dates, counts, tags, and EXIF labels.
- **Hairline** (#DEDED9): the rules around the EXIF block.

### Over photos

- **Caption White** (#FFFFFF): titles and dates placed on a photo.
- **Caption Scrim** (transparent to `rgba(0, 0, 0, 0.74)`, top to bottom): sits behind every caption on a photo.
- **Credit White** (`rgba(255, 255, 255, 0.78)`): the `© miaikoo` credit.

**The Photo Color Rule.** The interface adds no color. Any color on screen should come from a photograph.

**The Readable Caption Rule.** Test captions on the owner's brightest photos during the build, because the scrim's contrast depends on the image underneath.

## Typography

**Display Font:** Fraunces (with Georgia, serif), using `SOFT` 100 and `WONK` 1
**Body Font:** Plus Jakarta Sans (with system-ui, sans-serif)

**Character:** A soft, slightly odd serif gives the site its personality, and a clean, friendly sans keeps the details easy to read. Self-host both fonts.

### Hierarchy

Sizes come from the mockups and can be tuned during the build.

- **Logo** (Fraunces 500, 23px on laptop, 19px on phone): `miaikoo`, always lowercase and without ©.
- **Page title** (Fraunces 500, about 46px on laptop, 30px on phone, line height 1.04, tracking -0.015em): event names on event pages.
- **Photo caption title** (Fraunces 500, about 38px on laptop, 25px on phone, line height 1.04, tracking -0.015em): event names on homepage covers.
- **Photo page title** (Fraunces 500, about 28px on laptop, 23px on phone, line height 1.08): the event name on a photo page.
- **Body and details** (Plus Jakarta Sans 400, 12.5–13.5px, tabular figures): navigation, dates, counts, tags, and EXIF.

Interface text stays at 11px or larger. Only the credit on a photo may go smaller, because it scales with the image.

**The Warm Title Rule.** Titles are never all caps or condensed. That combination is what made earlier versions feel rigid.

## Layout

The system is built from rows of whole photos, in the order the owner curated.

### Spacing

- **Laptop:** 24px between photos and at the left, right, and bottom page edges.
- **Phone:** 12px in the same places.
- **Header:** about 58px tall on laptop and 46px on phone, on white above the photos.

### Homepage and event pages

Build each row by adding photos until their combined width-to-height ratio reaches 2, then scale the row to fill the page width. Every photo in a row shares one height and keeps its ratio. A final landscape that can't complete a row fills the width on its own, and a final square or portrait joins the row before it. A row with the same landscape and portrait pattern as the row above is mirrored, so landscape-portrait is followed by portrait-landscape. Previous, next, and the thumbnails follow this displayed order.

| Row | Height at a 1440px-wide window |
| --- | --- |
| 3:2 + 2:3 | about 631px |
| 3:2 + 3:2 | about 456px |
| 2:3 + 2:3 + 2:3 | about 672px |

On phones, each photo normally takes the full width. On the homepage, the event title and date sit at the bottom left of the cover. On event pages, the title sits above the photos with the date and tags beside it, moving under the title on phones.

Set each photo's aspect ratio before it loads, so the layout doesn't jump.

### Photo page

- **3:2 on laptop:** the photo takes the width left after a 240px side column. EXIF runs as one row under the photo. The side column holds the title, details, previous and next controls, copy link, and more photos from the event.
- **2:3 on laptop:** the photo takes the full available height. The wider panel beside it holds the title, a 3-by-2 EXIF grid, the controls, and more photos from the event.
- **Phone:** the photo comes first at full width, followed by the title, EXIF grid, and controls.

Thumbnails keep their original ratios, and the panel scrolls if there are more than fit. Hide any EXIF field with no value.

### Not designed yet

The tag and about pages should follow these rules, but neither has been reviewed.

## Elevation & Depth

Flat by default, with no shadows. Separation comes from white margins, and the only layering is the caption scrim on a photo.

**The Flat Print Rule.** If a photo seems to need a shadow or a border, adjust the margin instead.

## Shapes

Photos have square corners (0px), so the full frame stays intact. The only other line in the system is the 1px hairline around EXIF.

**The Whole Frame Rule.** Never round or crop a photograph in a gallery view.

## Do's and Don'ts

### Do:

- **Do** let photos fill the screen, and put empty panel space to work with more of the owner's photos.
- **Do** keep a full row within one laptop screen where the ratios allow it.
- **Do** burn `© miaikoo` into every public image at the bottom right by default, scaling it per output width (640, 1024, 1600, 2400) so it stays legible on phones.
- **Do** give photos an entrance: each tile wipes up once as it reaches the screen while the photo settles from a slight zoom, tiles in a row stagger by 80ms, and the caption rises after the photo. Going back to a page doesn't replay it.
- **Do** let a photo grow from its tile into the photo page, and shrink back, with a shared-element view transition.
- **Do** keep navigation between photos instant: previous, next, arrow keys, swipes, and thumbnails don't animate. Other interface transitions stay under 300ms, hover effects apply only on devices with a pointer, and `prefers-reduced-motion` swaps movement for a short fade.
- **Do** use drawn SVG icons for previous, next, and close in the build. The mockups' text arrows are placeholders.

### Don't:

- **Don't** leave large empty areas on a page.
- **Don't** use all-caps or condensed titles.
- **Don't** round photo corners.
- **Don't** switch the photo page to a dark background. The owner chose the light version.
- **Don't** zoom or pan a resting photo past 2%, because that would crop the burned-in credit.
