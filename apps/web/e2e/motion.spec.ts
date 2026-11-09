import { expect, test, type Page } from "@playwright/test";

const countViewTransitions = (page: Page) =>
  page.addInitScript(() => {
    const original = document.startViewTransition.bind(document);
    (window as unknown as { vt: number }).vt = 0;
    document.startViewTransition = ((...args: Parameters<typeof original>) => {
      (window as unknown as { vt: number }).vt += 1;
      return original(...args);
    }) as typeof document.startViewTransition;
  });
// A click before hydration is a normal page load, which has no view transition or memory.
const hydrated = (page: Page) =>
  page.waitForFunction(() => {
    const tile = document.querySelector(".photo-tile");
    return tile && Object.keys(tile).some((key) => key.startsWith("__reactFiber"));
  });
const viewTransitions = (page: Page) => page.evaluate(() => (window as unknown as { vt: number }).vt);

test("a row with the same shape as the row above is mirrored", async ({ page }) => {
  await page.goto("/");
  const titles = page.locator(".photo-row").nth(1).locator("[data-caption-title]");
  await expect(titles).toHaveText(["Two Frames", "Morning Fog"]);
});

test("a tile below the fold reveals when scrolled to, then stays unclipped", async ({ page }) => {
  await page.goto("/events/large-roll/");
  const last = page.locator(".photo-tile").last();
  await expect(last).not.toHaveAttribute("data-reveal", /.*/);
  await last.scrollIntoViewIfNeeded();
  await expect(last).toHaveAttribute("data-reveal", "in");
  await expect.poll(() => last.evaluate((el) => getComputedStyle(el).clipPath)).toBe("none");
});

test("the first row plays on load and ends unclipped", async ({ page }) => {
  await page.goto("/");
  const first = page.locator(".photo-tile").first();
  await expect(first).toHaveAttribute("data-reveal", "in");
  await expect.poll(() => first.evaluate((el) => getComputedStyle(el).clipPath)).toBe("none");
});

test("going back doesn't replay the reveal", async ({ page }) => {
  await page.goto("/");
  await hydrated(page);
  await page.locator(".photo-tile").first().click();
  await expect(page).toHaveURL(/\/events\//);
  await page.goBack();
  await expect(page.locator(".photo-tile").first()).toHaveAttribute("data-reveal", "done");
});

test("opening a photo from its tile starts a view transition", async ({ page }) => {
  await countViewTransitions(page);
  await page.goto("/events/morning-fog/");
  await hydrated(page);
  await page.locator(".photo-tile").first().click();
  await expect(page).toHaveURL(/morning-fog\/01\/$/);
  await expect.poll(() => viewTransitions(page)).toBeGreaterThan(0);
});

test("arrow keys change photos without a view transition", async ({ page }) => {
  await countViewTransitions(page);
  await page.goto("/events/morning-fog/01/");
  await page.locator("[data-gestures-ready]").waitFor({ state: "attached" });
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/morning-fog\/02\/$/);
  // A view transition can start just after the URL changes.
  await page.waitForTimeout(500);
  expect(await viewTransitions(page)).toBe(0);
});

test("reduced motion replaces the wipe with a fade and drops movement", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const first = page.locator(".photo-tile").first();
  expect(await first.evaluate((el) => getComputedStyle(el).animationName)).toBe("fade-in");
  expect(await first.locator(".photo").evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
});

test("without JavaScript every tile is visible", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  await page.goto("/events/large-roll/");
  expect(await page.locator(".photo-tile").last().evaluate((el) => getComputedStyle(el).clipPath)).toBe("none");
  await context.close();
});
