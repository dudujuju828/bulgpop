import { test, expect, type Page, type Locator } from "@playwright/test";
import { THEMES } from "../lib/vocab";

const THEME = THEMES.find((t) => t.id === "numbers")!;

type Dir = "en2bg" | "bg2en";

const DIR_LABEL: Record<Dir, string> = {
  en2bg: "EN → BG",
  bg2en: "BG → EN",
};

async function start(
  page: Page,
  opts: { diff?: string; dir?: Dir; theme?: string } = {},
) {
  const diff = opts.diff ?? "Easy";
  const dir = DIR_LABEL[opts.dir ?? "en2bg"];
  const themeName = opts.theme ?? THEME.name;
  await page.goto("/");
  await expect(page.getByTestId("menu")).toBeVisible();
  await page.getByRole("button", { name: diff }).click();
  await page.getByRole("button", { name: dir }).click();
  await page.getByRole("button", { name: themeName }).click();
  await expect(page.getByTestId("play")).toBeVisible();
}

const fallingBubble = (page: Page): Locator =>
  page.locator('[data-testid="bubble"][data-state="falling"]');

// Pop a falling bubble via the DOM (the element is in constant motion, so a
// normal Playwright click would never see it as "stable").
async function pop(page: Page) {
  const bubble = fallingBubble(page);
  await expect(bubble).toBeVisible();
  await bubble.evaluate((el) => (el as HTMLElement).click());
  await expect(page.getByTestId("answer-input")).toBeVisible();
}

function answerFor(prompt: string, dir: Dir): string {
  const p = prompt.trim();
  const word =
    dir === "en2bg"
      ? THEME.words.find((w) => w.en === p)
      : THEME.words.find((w) => w.bg === p);
  if (!word) throw new Error(`prompt not found in vocab: "${p}"`);
  return dir === "en2bg" ? word.bg : word.en.split("/")[0].trim();
}

async function answer(page: Page, text: string) {
  const input = page.getByTestId("answer-input");
  await input.fill(text);
  await input.press("Enter");
}

async function answerCorrect(page: Page, dir: Dir) {
  await pop(page);
  const prompt = (await page.getByTestId("prompt").textContent()) ?? "";
  await answer(page, answerFor(prompt, dir));
}

async function lives(page: Page): Promise<number> {
  return Number(await page.getByTestId("lives").getAttribute("data-lives"));
}

test.describe("setup menu", () => {
  test("difficulty and direction toggles reflect selection", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Hard" }).click();
    await page.getByRole("button", { name: "BG → EN" }).click();
    await expect(page.getByRole("button", { name: "Hard" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByRole("button", { name: "Easy" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(page.getByRole("button", { name: "BG → EN" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

test.describe("core round flows", () => {
  test("correct answers score points with a rising streak bonus", async ({
    page,
  }) => {
    await start(page, { diff: "Easy", dir: "en2bg" });
    await expect(page.getByTestId("score")).toHaveText("0");

    await answerCorrect(page, "en2bg");
    await expect(page.getByTestId("feedback")).toHaveAttribute(
      "data-feedback",
      "correct",
    );

    await answerCorrect(page, "en2bg");
    await answerCorrect(page, "en2bg");

    // 10 + 11 + 12 = 33 (streak bonus = min(streak, 10))
    await expect(page.getByTestId("score")).toHaveText("33");
    expect(await lives(page)).toBe(5);
  });

  test("reverse mode (BG → EN) accepts the English answer", async ({ page }) => {
    await start(page, { diff: "Easy", dir: "bg2en" });
    await answerCorrect(page, "bg2en");
    await expect(page.getByTestId("feedback")).toHaveAttribute(
      "data-feedback",
      "correct",
    );
  });

  test("a wrong answer costs a life and reveals the correct word", async ({
    page,
  }) => {
    await start(page, { diff: "Easy", dir: "en2bg" });
    await pop(page);
    const prompt = (await page.getByTestId("prompt").textContent())!.trim();
    const word = THEME.words.find((w) => w.en === prompt)!;
    await answer(page, "definitelywrong");

    const fb = page.getByTestId("feedback");
    await expect(fb).toHaveAttribute("data-feedback", "wrong");
    await expect(fb).toContainText(word.bg); // correct answer shown
    await expect(fb).toContainText(word.cyr); // cyrillic shown
    expect(await lives(page)).toBe(4);
  });

  test("empty Enter does NOT cost a life or resolve the round", async ({
    page,
  }) => {
    await start(page, { diff: "Easy", dir: "en2bg" });
    await pop(page);
    expect(await lives(page)).toBe(5);

    await page.getByTestId("answer-input").press("Enter"); // blank submit
    // still answering, no feedback, no life lost
    await expect(page.getByTestId("answer-input")).toBeVisible();
    await expect(page.getByTestId("feedback")).toHaveCount(0);
    expect(await lives(page)).toBe(5);

    // a real correct answer still works afterwards
    const prompt = (await page.getByTestId("prompt").textContent()) ?? "";
    await answer(page, answerFor(prompt, "en2bg"));
    await expect(page.getByTestId("feedback")).toHaveAttribute(
      "data-feedback",
      "correct",
    );
  });

  test("a bubble that reaches the bottom is a miss and costs a life", async ({
    page,
  }) => {
    await start(page, { diff: "Hard", dir: "en2bg" }); // fast fall
    expect(await lives(page)).toBe(2);
    // do not pop — let it drop
    await expect(page.getByTestId("feedback")).toHaveAttribute(
      "data-feedback",
      "miss",
      { timeout: 25_000 },
    );
    expect(await lives(page)).toBe(1);
  });
});

test.describe("end-to-end run", () => {
  test("losing all lives shows the recap; play again and change setup work", async ({
    page,
  }) => {
    await start(page, { diff: "Easy", dir: "en2bg" });

    // Burn all 5 lives with wrong answers.
    for (let i = 0; i < 5; i++) {
      await pop(page);
      await answer(page, "nope");
      await expect(page.getByTestId("feedback")).toHaveAttribute(
        "data-feedback",
        "wrong",
      );
    }

    const over = page.getByTestId("gameover");
    await expect(over).toBeVisible();
    await expect(over).toContainText("Words to review");
    await expect(over).toContainText("0%"); // accuracy, all wrong
    // words seen should be at least 5
    const seen = await over
      .locator("text=words seen")
      .locator("xpath=preceding-sibling::span[1]")
      .textContent();
    expect(Number(seen)).toBeGreaterThanOrEqual(5);

    // Play again -> straight back into a fresh game.
    await page.getByRole("button", { name: "Play again" }).click();
    await expect(page.getByTestId("play")).toBeVisible();
    await expect(page.getByTestId("score")).toHaveText("0");
    expect(await lives(page)).toBe(5);

    // Quit back to the menu.
    await page.getByRole("button", { name: "menu" }).click();
    await expect(page.getByTestId("menu")).toBeVisible();
  });
});
