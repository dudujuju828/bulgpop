import { test, expect } from "@playwright/test";
import {
  THEME,
  start,
  pop,
  answer,
  answerCorrect,
  answerFor,
  fallingBubble,
  lives,
  loseAllLives,
} from "./helpers";

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

  test("a wrong answer costs a life, reveals the word, and forces a retype", async ({
    page,
  }) => {
    await start(page, { diff: "Easy", dir: "en2bg" });
    await pop(page);
    const prompt = (await page.getByTestId("prompt").textContent())!.trim();
    const word = THEME.words.find((w) => w.en === prompt)!;
    await answer(page, "definitelywrong");

    const fb = page.getByTestId("feedback");
    await expect(fb).toHaveAttribute("data-feedback", "wrong");
    await expect(fb).toHaveAttribute("data-mode", "correcting"); // must retype
    await expect(fb).toContainText(word.bg);
    await expect(fb).toContainText(word.cyr);
    expect(await lives(page)).toBe(4);

    // A wrong retype keeps you stuck (and never costs an extra life).
    const ci = page.getByTestId("correction-input");
    await ci.fill("nope");
    await ci.press("Enter");
    await expect(fb).toHaveAttribute("data-mode", "correcting");
    expect(await lives(page)).toBe(4);

    // The correct retype advances to the next bubble.
    await ci.fill(word.bg);
    await ci.press("Enter");
    await expect(fallingBubble(page)).toBeVisible();
    expect(await lives(page)).toBe(4);
  });

  test("empty Enter does NOT cost a life or resolve the round", async ({
    page,
  }) => {
    await start(page, { diff: "Easy", dir: "en2bg" });
    await pop(page);
    expect(await lives(page)).toBe(5);

    await page.getByTestId("answer-input").press("Enter"); // blank submit
    await expect(page.getByTestId("answer-input")).toBeVisible();
    await expect(page.getByTestId("feedback")).toHaveCount(0);
    expect(await lives(page)).toBe(5);

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
    await loseAllLives(page);

    const over = page.getByTestId("gameover");
    await expect(over).toContainText("Words to review");
    await expect(over).toContainText("0%"); // accuracy, all wrong

    await page.getByRole("button", { name: "Play again" }).click();
    await expect(page.getByTestId("play")).toBeVisible();
    await expect(page.getByTestId("score")).toHaveText("0");
    expect(await lives(page)).toBe(5);

    await page.getByRole("button", { name: "menu" }).click();
    await expect(page.getByTestId("menu")).toBeVisible();
  });
});
