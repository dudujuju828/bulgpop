# BulgaPop 🫧

A tiny browser game for learning Bulgarian vocabulary. Pick a theme, bubbles
fall from the top — **pop one and type the word before it hits the bottom**.
Bulgarian is written with normal Latin letters here, so _"behind us"_ is
`zad nas`.

- **Pop, then type — under pressure** — click a falling bubble to reveal the
  prompt and an input box. The bubble **keeps falling while you type**; if it
  reaches the bottom before you submit, you lose a life.
- **Lives + endless** — miss or answer wrong and you lose a life. Fall speed
  ramps up the longer you survive. Beat your high score (saved locally).
- **Difficulty modes** — Easy (slow, 5 lives), Normal (3 lives), Hard (fast,
  2 lives, steep ramp).
- **Direction modes** — EN → BG (type Bulgarian), BG → EN (type English), or
  Mixed (random each bubble).
- **Pronunciation** — Bulgarian words are spoken aloud via browser text-to-speech
  (auto where it won't spoil the answer, plus a replay 🔊 button). Falls back
  silently if no Bulgarian voice is installed.
- **Learn on every round** — feedback shows the correct Latin spelling _and_ the
  Cyrillic.
- **Retype to continue** — when you get a word wrong or let it drop, you must
  type it correctly before the next bubble. Active recall, not just a flash.
- **Adaptive practice** — missed words are weighted to reappear sooner, so the
  game drills your weak spots instead of pure chance (see `pickIndex` in
  [`lib/vocab.ts`](lib/vocab.ts)).
- **End-of-game recap** — accuracy %, words seen, and a "words to review" list of
  everything you missed.
- **100 themes, 2,600+ words** — everyday phrases, food & drink, travel, numbers,
  family, body, weather, shopping, verbs, colors, animals, the home, jobs, tech,
  emotions, adjectives, sports, school, the kitchen, the city, nature, grammar
  (pronouns / prepositions / little words), restaurant, transport, money,
  calendar, clothing, materials, survival phrases, music, the garden, health,
  the office, holidays, fruit & veg, drinks, personality, the sea, the bathroom,
  Bulgarian specialties, tools, science, hotels, the airport, ordinals, daily
  routine, countries, cleaning, wild animals, coding, communication, quantities,
  senses, public signs — and more (~26 words each).
- **Installable & offline (PWA)** — install it to your home screen and play with
  no connection (great on a plane). A service worker precaches the app shell and
  assets at build time.

## Run it

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Stack

Next.js (App Router) + React + TypeScript. No external game/UI libraries — the
bubbles, animations, and sound are all hand-rolled. Vocabulary lives in
[`lib/vocab.ts`](lib/vocab.ts) — edit that file to add words or themes.

## Tests

End-to-end and logic tests run with Playwright:

```bash
npm test
```

The config builds and serves the app automatically (or reuses a server already
running on :3000).

- `e2e/flows.spec.ts` — drives the real game in a browser: popping, scoring,
  wrong/miss/empty-submit handling, the keep-falling miss, and the full lose →
  recap → play-again → menu loop.
- `e2e/logic.spec.ts` — answer matching and vocabulary integrity (every word
  accepts its own answer in both directions).
- `e2e/responsive.spec.ts` — at desktop/short/mobile viewports: the menu and
  game-over screens scroll so every control is reachable and clickable, while
  the in-game screen stays locked to the viewport (no page scroll).

## Answer checking

Answers are matched exactly, after trimming, lowercasing, dropping punctuation,
and collapsing extra spaces. A `/` in a vocabulary value marks alternatives, so
`hand / arm` accepts either word. To loosen matching further, edit `normalize` /
`matches` in `lib/vocab.ts`.
