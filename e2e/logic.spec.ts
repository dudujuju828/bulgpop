import { test, expect } from "@playwright/test";
import { matches, normalize, THEMES } from "../lib/vocab";

test.describe("normalize", () => {
  test("lowercases, trims, collapses spaces, drops punctuation", () => {
    expect(normalize("  Zad   Nas! ")).toBe("zad nas");
    expect(normalize("What's")).toBe("whats");
    expect(normalize("")).toBe("");
    expect(normalize("кафе")).toBe("кафе"); // keeps unicode letters
  });
});

test.describe("matches", () => {
  test("exact match, case/space/punctuation insensitive", () => {
    expect(matches("zad nas", "zad nas")).toBe(true);
    expect(matches("ZAD NAS", "zad nas")).toBe(true);
    expect(matches("  zad  nas ", "zad nas")).toBe(true);
    expect(matches("zadnas", "zad nas")).toBe(false);
  });

  test("empty input never matches", () => {
    expect(matches("", "da")).toBe(false);
    expect(matches("   ", "da")).toBe(false);
  });

  test("apostrophes are ignored on both sides", () => {
    expect(matches("what's your name", "what's your name")).toBe(true);
    expect(matches("whats your name", "what's your name")).toBe(true);
  });

  test("slash marks alternatives", () => {
    expect(matches("hand", "hand / arm")).toBe(true);
    expect(matches("arm", "hand / arm")).toBe(true);
    expect(matches("foot", "leg / foot")).toBe(true);
    expect(matches("wrist", "hand / arm")).toBe(false);
  });
});

test.describe("vocab integrity", () => {
  test("theme ids are unique and every word is fully populated", () => {
    const ids = THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(THEMES.length).toBeGreaterThanOrEqual(9);
    for (const t of THEMES) {
      expect(t.words.length, `${t.id} word count`).toBeGreaterThanOrEqual(15);
      for (const w of t.words) {
        expect(w.en.trim(), `${t.id} en`).not.toBe("");
        expect(w.bg.trim(), `${t.id} bg`).not.toBe("");
        expect(w.cyr.trim(), `${t.id} cyr`).not.toBe("");
      }
    }
  });

  test("every word accepts its own stored answer (both directions)", () => {
    for (const t of THEMES) {
      for (const w of t.words) {
        // EN -> BG: typing the stored bg passes
        expect(matches(w.bg, w.bg), `${w.en} bg`).toBe(true);
        // BG -> EN: typing the first english alternative passes
        const firstEn = w.en.split("/")[0];
        expect(matches(firstEn, w.en), `${w.en} en`).toBe(true);
      }
    }
  });
});
