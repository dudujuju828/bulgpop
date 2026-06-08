import { test, expect } from "@playwright/test";
import { THEMES } from "../lib/vocab";

test.describe("PWA", () => {
  test("serves a valid web manifest with icons", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.ok()).toBeTruthy();
    const m = await res.json();
    expect(m.name).toContain("BulgaPop");
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/");
    expect(Array.isArray(m.icons)).toBe(true);
    expect(m.icons.length).toBeGreaterThanOrEqual(2);
    const purposes = m.icons.map((i: { purpose?: string }) => i.purpose);
    expect(purposes).toContain("maskable");
  });

  test("icons are reachable", async ({ request }) => {
    for (const url of ["/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"]) {
      const res = await request.get(url);
      expect(res.ok(), url).toBeTruthy();
      expect(res.headers()["content-type"]).toContain("image/png");
    }
  });

  test("registers a service worker and runs fully offline", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("menu")).toBeVisible();

    // Wait until the service worker controls the page (install precache done).
    await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, {
      timeout: 20_000,
    });

    // Go offline and reload — the app shell + assets must come from cache.
    await context.setOffline(true);
    try {
      await page.reload();
      await expect(page.getByTestId("menu")).toBeVisible();

      // And it's fully interactive offline.
      await page.getByRole("button", { name: THEMES[0].name }).click();
      await expect(page.getByTestId("play")).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });
});
