import { expect, test, type Page } from "@playwright/test";

const LONG_EVENT = "a-deliberately-long-event-title-that-must-wrap-on-a-small-phone-screen";
const LAPTOP = { width: 1440, height: 900 };

async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("[data-gestures-ready]")).toHaveCount(1);
}

const main = (page: Page) => page.locator("[data-photo-main] img");

async function expectInViewport(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox();
  const size = page.viewportSize()!;
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(size.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(size.height);
}

test.describe("laptop", () => {
  test.skip(({ viewport }) => viewport?.width !== LAPTOP.width);

  test("landscape layout shows photo and EXIF row on one screen", async ({ page }) => {
    await open(page, "/events/morning-fog/01/");
    await expectInViewport(page, "[data-photo-main] img");
    await expectInViewport(page, "[data-exif]");
    const photo = (await main(page).boundingBox())!;
    const exif = (await page.locator("[data-exif]").boundingBox())!;
    const panel = (await page.locator("[data-panel]").boundingBox())!;
    expect(exif.y).toBeGreaterThanOrEqual(photo.y + photo.height);
    expect(panel.x).toBeGreaterThanOrEqual(photo.x + photo.width);
    expect(photo.width).toBeGreaterThan(1050);
  });

  test("portrait layout puts EXIF beside the photo", async ({ page }) => {
    await open(page, "/events/morning-fog/02/");
    await expectInViewport(page, "[data-photo-main] img");
    const photo = (await main(page).boundingBox())!;
    const exif = (await page.locator("[data-exif]").boundingBox())!;
    expect(exif.x).toBeGreaterThanOrEqual(photo.x + photo.width);
    expect(photo.height).toBeGreaterThan(780);
  });

  for (const id of ["05", "06"]) {
    test(`unusual ratio ${id} fits uncropped`, async ({ page }) => {
      await open(page, `/events/morning-fog/${id}/`);
      await expectInViewport(page, "[data-photo-main] img");
      const box = (await main(page).boundingBox())!;
      const ratio = Number(await main(page).getAttribute("width")) / Number(await main(page).getAttribute("height"));
      expect(Math.abs(box.width / box.height - ratio) / ratio).toBeLessThan(0.01);
    });
  }

  test("arrow keys move within the event", async ({ page }) => {
    await open(page, "/events/morning-fog/01/");
    await page.keyboard.press("ArrowRight");
    await expect(page).toHaveURL(/\/morning-fog\/02\/$/);
    await expect(page.locator("[data-gestures-ready]")).toHaveCount(1);
    await page.keyboard.press("ArrowLeft");
    await expect(page).toHaveURL(/\/morning-fog\/01\/$/);
  });

  test("arrow keys stop at the first and last photos", async ({ page }) => {
    await open(page, "/events/morning-fog/01/");
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(200);
    await expect(page).toHaveURL(/\/morning-fog\/01\/$/);
    await open(page, "/events/morning-fog/06/");
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(200);
    await expect(page).toHaveURL(/\/morning-fog\/06\/$/);
  });

  test("modified arrow keys are left to the browser", async ({ page }) => {
    await open(page, "/events/morning-fog/02/");
    for (const key of ["Alt+ArrowLeft", "Control+ArrowLeft", "Shift+ArrowRight", "Meta+ArrowRight"]) {
      await page.keyboard.press(key);
      await page.waitForTimeout(100);
      await expect(page).toHaveURL(/\/morning-fog\/02\/$/);
    }
  });

  test("Escape returns to the event", async ({ page }) => {
    await open(page, "/events/morning-fog/02/");
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/events\/morning-fog\/$/);
  });

  test("copy link writes the page URL", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await open(page, "/events/morning-fog/02/");
    await page.getByRole("button", { name: "copy link" }).click();
    await expect(page.getByText("Copied")).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toMatch(/\/events\/morning-fog\/02\/$/);
  });

  test("copy link reports failure", async ({ page }) => {
    await open(page, "/events/morning-fog/02/");
    await page.evaluate(() => {
      navigator.clipboard.writeText = () => Promise.reject(new Error("denied"));
    });
    await page.getByRole("button", { name: "copy link" }).click();
    await expect(page.getByText("Couldn't copy link")).toBeVisible();
  });
});

test.describe("phone", () => {
  test.skip(({ viewport }) => viewport?.width !== 390);

  test("photo comes first at full width", async ({ page }) => {
    await open(page, "/events/morning-fog/02/");
    const photo = (await main(page).boundingBox())!;
    const title = (await page.getByRole("heading", { level: 1 }).boundingBox())!;
    expect(Math.round(photo.width)).toBe(390 - 24);
    expect(title.y).toBeGreaterThanOrEqual(photo.y + photo.height);
  });

  async function swipe(page: Page, fromX: number, toX: number) {
    const box = (await main(page).boundingBox())!;
    const y = Math.max(box.y + box.height / 2, 200);
    const session = await page.context().newCDPSession(page);
    const point = (x: number) => [{ x, y }];
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(fromX) });
    for (let x = fromX; Math.abs(x - toX) > 1; x += (toX - fromX) / 6) {
      await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: point(x) });
    }
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: point(toX) });
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }

  test("swipe changes photos", async ({ page }) => {
    await open(page, "/events/morning-fog/02/");
    await swipe(page, 320, 80);
    await expect(page).toHaveURL(/\/morning-fog\/03\/$/);
    await expect(page.locator("[data-gestures-ready]")).toHaveCount(1);
    await swipe(page, 80, 320);
    await expect(page).toHaveURL(/\/morning-fog\/02\/$/);
  });

  test("swipe past the first photo stays put and settles", async ({ page }) => {
    await open(page, "/events/morning-fog/01/");
    await swipe(page, 80, 320);
    await page.waitForTimeout(300);
    await expect(page).toHaveURL(/\/morning-fog\/01\/$/);
    const transform = await page.locator("[data-gestures-ready]").evaluate((el) => getComputedStyle(el).transform);
    expect(["none", "matrix(1, 0, 0, 1, 0, 0)"]).toContain(transform);
  });
});

test("first and last photos have no dead-end links", async ({ page }) => {
  await open(page, "/events/morning-fog/01/");
  await expect(page.getByRole("link", { name: "Previous photo" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Next photo" })).toHaveCount(1);
  await open(page, "/events/morning-fog/06/");
  await expect(page.getByRole("link", { name: "Next photo" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Previous photo" })).toHaveCount(1);
});

test("one-photo event has neither control", async ({ page }) => {
  await open(page, `/events/${LONG_EVENT}/01/`);
  await expect(page.getByRole("link", { name: "Previous photo" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Next photo" })).toHaveCount(0);
});

test("empty EXIF fields are hidden", async ({ page }) => {
  await open(page, "/events/wet-night-downtown/04/");
  await expect(page.locator("[data-exif] dt")).toHaveText(["ISO"]);
  await open(page, `/events/${LONG_EVENT}/01/`);
  await expect(page.locator("[data-exif]")).toHaveCount(0);
});

test("details show the photo's date, or the event's without one", async ({ page }) => {
  await open(page, "/events/wet-night-downtown/01/");
  await expect(page.getByText("Photo 1 of 4 · Aug 17, 2026")).toBeVisible();
  await open(page, "/events/wet-night-downtown/04/");
  await expect(page.getByText("Photo 4 of 4 · Sep 20, 2026")).toBeVisible();
});

test("thumbnails mark the current photo", async ({ page }) => {
  await open(page, "/events/morning-fog/03/");
  const current = page.locator('a[aria-current="page"]');
  await expect(current).toHaveCount(1);
  await expect(current).toHaveAccessibleName(/Photo 3 of 6/);
});

test("title returns to the event", async ({ page }) => {
  await open(page, "/events/morning-fog/02/");
  await page.getByRole("heading", { level: 1 }).getByRole("link").click();
  await expect(page).toHaveURL(/\/events\/morning-fog\/$/);
});

test("share tags use the right image", async ({ page }) => {
  await page.goto("/events/morning-fog/01/");
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /^http.*01-1600\.webp$/);
  await page.goto(`/events/${LONG_EVENT}/01/`);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /01-1200\.webp$/);
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("next link navigates", async ({ page }) => {
    await page.goto("/events/morning-fog/01/");
    await page.getByRole("link", { name: "Next photo" }).click();
    await expect(page).toHaveURL(/\/morning-fog\/02\/$/);
  });
});

test("thumbnails use the panel when an event is small", async ({ page, viewport }) => {
  test.skip(viewport?.width !== LAPTOP.width);
  await open(page, "/events/morning-fog/02/");
  const list = (await page.locator(".photo-thumbs ul").boundingBox())!;
  const panel = (await page.locator("[data-panel]").boundingBox())!;
  expect(list.y + list.height).toBeGreaterThan(panel.y + panel.height * 0.6);
});
