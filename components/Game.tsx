"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { THEMES, normalize, type Theme, type Word } from "@/lib/vocab";
import styles from "./Game.module.css";

const BUBBLE = 132; // bubble diameter in px
const START_LIVES = 3;
const COLORS = ["pink", "yellow", "aqua", "violet"] as const;

type Phase = "menu" | "playing" | "gameover";
type BubbleState = "falling" | "answering" | "feedback";
type FeedbackType = "correct" | "wrong" | "miss";

type Round = {
  id: number;
  word: Word;
  x: number; // horizontal position, percent
  color: (typeof COLORS)[number];
};

type Feedback = { type: FeedbackType; word: Word; typed: string };

export default function Game() {
  const [phase, setPhase] = useState<Phase>("menu");
  const [theme, setTheme] = useState<Theme | null>(null);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [lives, setLives] = useState(START_LIVES);
  const [streak, setStreak] = useState(0);
  const [muted, setMuted] = useState(false);

  const [round, setRound] = useState<Round | null>(null);
  const [bubbleState, setBubbleState] = useState<BubbleState>("falling");
  const [y, setY] = useState(-BUBBLE);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const playRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const yRef = useRef(-BUBBLE);
  const speedRef = useRef(55);
  const roundCountRef = useRef(0);
  const gameOverRef = useRef(false);
  const lastWordRef = useRef<string>("");
  const audioRef = useRef<AudioContext | null>(null);

  // ---- sound -------------------------------------------------------------
  const beep = useCallback(
    (freq: number, dur: number, type: OscillatorType = "sine", vol = 0.18) => {
      if (muted) return;
      try {
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        const ctx = audioRef.current ?? (audioRef.current = new Ctx());
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = type;
        o.frequency.value = freq;
        o.connect(g);
        g.connect(ctx.destination);
        const t = ctx.currentTime;
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.start(t);
        o.stop(t + dur);
      } catch {
        /* audio not available */
      }
    },
    [muted],
  );

  // ---- best score persistence -------------------------------------------
  useEffect(() => {
    const saved = Number(localStorage.getItem("bulgapop-best") || 0);
    if (saved) setBest(saved);
  }, []);

  // ---- round lifecycle ---------------------------------------------------
  const nextRound = useCallback(() => {
    if (!theme) return;
    roundCountRef.current += 1;
    speedRef.current = Math.min(55 + roundCountRef.current * 5, 235);

    let word = theme.words[Math.floor(Math.random() * theme.words.length)];
    if (theme.words.length > 1) {
      while (word.en === lastWordRef.current) {
        word = theme.words[Math.floor(Math.random() * theme.words.length)];
      }
    }
    lastWordRef.current = word.en;

    yRef.current = -BUBBLE;
    setY(-BUBBLE);
    setInput("");
    setFeedback(null);
    setRound({
      id: roundCountRef.current,
      word,
      x: 16 + Math.random() * 68,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    });
    setBubbleState("falling");
  }, [theme]);

  const startGame = useCallback(
    (t: Theme) => {
      setTheme(t);
      setScore(0);
      setLives(START_LIVES);
      setStreak(0);
      roundCountRef.current = 0;
      gameOverRef.current = false;
      lastWordRef.current = "";
      setPhase("playing");
    },
    [],
  );

  // Kick off the first bubble once a theme is chosen.
  useEffect(() => {
    if (phase === "playing" && theme && !round) nextRound();
  }, [phase, theme, round, nextRound]);

  const loseLife = useCallback(() => {
    setStreak(0);
    setLives((l) => {
      const nl = l - 1;
      gameOverRef.current = nl <= 0;
      return nl;
    });
  }, []);

  // ---- falling animation -------------------------------------------------
  useEffect(() => {
    if (phase !== "playing" || bubbleState !== "falling") return;
    let raf = 0;
    let last: number | null = null;
    const step = (ts: number) => {
      const area = playRef.current;
      if (!area) {
        raf = requestAnimationFrame(step);
        return;
      }
      if (last === null) last = ts;
      const dt = Math.min((ts - last) / 1000, 0.05);
      last = ts;
      const floor = area.clientHeight - BUBBLE;
      const next = yRef.current + speedRef.current * dt;
      if (next >= floor) {
        yRef.current = floor;
        setY(floor);
        // missed it
        beep(150, 0.3, "sawtooth", 0.22);
        setBubbleState("feedback");
        setFeedback((f) =>
          round ? { type: "miss", word: round.word, typed: "" } : f,
        );
        loseLife();
        return;
      }
      yRef.current = next;
      setY(next);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [phase, bubbleState, round, beep, loseLife]);

  // ---- feedback -> next round / game over --------------------------------
  useEffect(() => {
    if (bubbleState !== "feedback" || !feedback) return;
    const dur = feedback.type === "correct" ? 850 : 1700;
    const t = setTimeout(() => {
      if (gameOverRef.current) setPhase("gameover");
      else nextRound();
    }, dur);
    return () => clearTimeout(t);
  }, [bubbleState, feedback, nextRound]);

  // ---- persist best on game over ----------------------------------------
  useEffect(() => {
    if (phase !== "gameover") return;
    setBest((b) => {
      const nb = Math.max(b, score);
      localStorage.setItem("bulgapop-best", String(nb));
      return nb;
    });
  }, [phase, score]);

  // ---- focus input when answering ---------------------------------------
  useEffect(() => {
    if (bubbleState === "answering") inputRef.current?.focus();
  }, [bubbleState]);

  // ---- actions -----------------------------------------------------------
  const popBubble = useCallback(() => {
    if (bubbleState !== "falling") return;
    beep(680, 0.12, "sine", 0.2);
    setBubbleState("answering");
  }, [bubbleState, beep]);

  const submit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (bubbleState !== "answering" || !round) return;
      const ok = normalize(input) === normalize(round.word.bg);
      if (ok) {
        beep(660, 0.1, "triangle", 0.18);
        setTimeout(() => beep(990, 0.14, "triangle", 0.18), 90);
        const pts = 10 + Math.min(streak, 10);
        setScore((s) => s + pts);
        setStreak((st) => st + 1);
        setFeedback({ type: "correct", word: round.word, typed: input });
      } else {
        beep(150, 0.3, "sawtooth", 0.22);
        setFeedback({ type: "wrong", word: round.word, typed: input });
        loseLife();
      }
      setBubbleState("feedback");
    },
    [bubbleState, round, input, streak, beep, loseLife],
  );

  const quitToMenu = useCallback(() => {
    setPhase("menu");
    setRound(null);
    setBubbleState("falling");
  }, []);

  // ---- render ------------------------------------------------------------
  return (
    <main className={styles.shell}>
      <DecorBubbles />

      {phase === "menu" && (
        <section className={styles.menu}>
          <p className={styles.kicker}>пук! · pop &amp; learn</p>
          <h1 className={styles.title}>
            Bulga<span className={styles.pop}>Pop</span>
          </h1>
          <p className={styles.tagline}>
            Bubbles fall. Pop one, then type the word in Bulgarian — written with
            normal letters. Three lives. How far can you get?
          </p>
          <div className={styles.flagRule} aria-hidden />
          <h2 className={styles.pickLabel}>Choose a theme</h2>
          <div className={styles.themeGrid}>
            {THEMES.map((t) => (
              <button
                key={t.id}
                className={styles.themeCard}
                style={{ "--hue": t.hue } as React.CSSProperties}
                onClick={() => startGame(t)}
              >
                <span className={styles.themeEmoji}>{t.emoji}</span>
                <span className={styles.themeName}>{t.name}</span>
                <span className={styles.themeCount}>{t.words.length} words</span>
              </button>
            ))}
          </div>
          {best > 0 && (
            <p className={styles.bestLine}>Best score: {best}</p>
          )}
        </section>
      )}

      {phase === "playing" && theme && (
        <section className={styles.game}>
          <header className={styles.hud}>
            <button className={styles.quit} onClick={quitToMenu}>
              ‹ menu
            </button>
            <div className={styles.themeTag}>
              <span>{theme.emoji}</span>
              {theme.name}
            </div>
            <div className={styles.scoreBox}>
              <span className={styles.scoreNum}>{score}</span>
              <span className={styles.scoreLabel}>score</span>
            </div>
            <div className={styles.lives}>
              {Array.from({ length: START_LIVES }).map((_, i) => (
                <span
                  key={i}
                  className={`${styles.life} ${i < lives ? styles.lifeOn : styles.lifeOff}`}
                >
                  {i < lives ? "🫧" : "·"}
                </span>
              ))}
            </div>
            <button
              className={styles.mute}
              onClick={() => setMuted((m) => !m)}
              aria-label={muted ? "Unmute" : "Mute"}
            >
              {muted ? "🔇" : "🔊"}
            </button>
          </header>

          {streak >= 2 && bubbleState !== "feedback" && (
            <div className={styles.streak}>🔥 {streak} streak</div>
          )}

          <div className={styles.play} ref={playRef}>
            {round && bubbleState === "falling" && (
              <button
                key={round.id}
                className={`${styles.bubble} ${styles[round.color]}`}
                style={{ left: `${round.x}%`, top: `${y}px` }}
                onClick={popBubble}
                aria-label="Pop the bubble"
              >
                <span className={styles.gloss} aria-hidden />
                <span className={styles.q}>?</span>
              </button>
            )}

            {round && bubbleState === "answering" && (
              <div className={styles.answerCard}>
                <span className={styles.askLabel}>say it in Bulgarian</span>
                <span className={styles.enWord}>{round.word.en}</span>
                <form onSubmit={submit} className={styles.answerForm}>
                  <input
                    ref={inputRef}
                    className={styles.input}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="type here…"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                  />
                  <button type="submit" className={styles.go}>
                    pop ✓
                  </button>
                </form>
              </div>
            )}

            {feedback && bubbleState === "feedback" && (
              <div
                className={`${styles.feedback} ${styles[`fb_${feedback.type}`]}`}
              >
                <span className={styles.fbBadge}>
                  {feedback.type === "correct"
                    ? "✓ pop!"
                    : feedback.type === "miss"
                      ? "missed it"
                      : "not quite"}
                </span>
                <span className={styles.fbEn}>{feedback.word.en}</span>
                <span className={styles.fbBg}>{feedback.word.bg}</span>
                <span className={styles.fbCyr}>{feedback.word.cyr}</span>
                {feedback.type === "wrong" && feedback.typed && (
                  <span className={styles.fbTyped}>
                    you wrote: {feedback.typed}
                  </span>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {phase === "gameover" && theme && (
        <section className={styles.menu}>
          <p className={styles.kicker}>game over</p>
          <h1 className={styles.title}>
            {score >= best && score > 0 ? "New best! 🎉" : "Nice run!"}
          </h1>
          <div className={styles.finalScore}>{score}</div>
          <p className={styles.tagline}>
            Best: {best} · Theme: {theme.emoji} {theme.name}
          </p>
          <div className={styles.flagRule} aria-hidden />
          <div className={styles.endButtons}>
            <button
              className={styles.playAgain}
              onClick={() => startGame(theme)}
            >
              Play again
            </button>
            <button className={styles.toMenu} onClick={quitToMenu}>
              Change theme
            </button>
          </div>
        </section>
      )}
    </main>
  );
}

function DecorBubbles() {
  // Static decorative bubbles drifting in the background.
  const specs = [
    { left: "8%", size: 90, dur: 17, delay: 0, hue: "var(--pop-pink)" },
    { left: "22%", size: 54, dur: 13, delay: 4, hue: "var(--pop-aqua)" },
    { left: "40%", size: 120, dur: 21, delay: 2, hue: "var(--pop-violet)" },
    { left: "62%", size: 70, dur: 15, delay: 6, hue: "var(--pop-yellow)" },
    { left: "78%", size: 100, dur: 19, delay: 1, hue: "var(--pop-pink)" },
    { left: "90%", size: 46, dur: 12, delay: 3, hue: "var(--pop-aqua)" },
  ];
  return (
    <div className={styles.decor} aria-hidden>
      {specs.map((s, i) => (
        <span
          key={i}
          className={styles.decorBubble}
          style={{
            left: s.left,
            width: s.size,
            height: s.size,
            background: `radial-gradient(circle at 32% 28%, #ffffffcc, ${s.hue} 70%)`,
            animationDuration: `${s.dur}s`,
            animationDelay: `${s.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
