// Bulgarian vocabulary, transliterated to Latin letters.
// `bg` is the accepted answer (Latin), `cyr` is shown for learning after each round.

export type Word = {
  en: string;
  bg: string; // Bulgarian written in Latin letters (the accepted answer)
  cyr: string; // Cyrillic, shown as a learning aid
};

export type Theme = {
  id: string;
  name: string;
  emoji: string;
  hue: number; // base hue used for the theme's accent gradient
  words: Word[];
};

export const THEMES: Theme[] = [
  {
    id: "everyday",
    name: "Everyday phrases",
    emoji: "💬",
    hue: 265,
    words: [
      { en: "hello", bg: "zdravey", cyr: "здравей" },
      { en: "goodbye", bg: "dovizhdane", cyr: "довиждане" },
      { en: "thank you", bg: "blagodarya", cyr: "благодаря" },
      { en: "please", bg: "molya", cyr: "моля" },
      { en: "yes", bg: "da", cyr: "да" },
      { en: "no", bg: "ne", cyr: "не" },
      { en: "good morning", bg: "dobro utro", cyr: "добро утро" },
      { en: "good night", bg: "leka nosht", cyr: "лека нощ" },
      { en: "how are you", bg: "kak si", cyr: "как си" },
      { en: "excuse me", bg: "izvinete", cyr: "извинете" },
      { en: "behind us", bg: "zad nas", cyr: "зад нас" },
      { en: "I love you", bg: "obicham te", cyr: "обичам те" },
      { en: "what's your name", bg: "kak se kazvash", cyr: "как се казваш" },
      { en: "where", bg: "kade", cyr: "къде" },
      { en: "now", bg: "sega", cyr: "сега" },
    ],
  },
  {
    id: "food",
    name: "Food & drink",
    emoji: "🍽️",
    hue: 12,
    words: [
      { en: "water", bg: "voda", cyr: "вода" },
      { en: "bread", bg: "hlyab", cyr: "хляб" },
      { en: "coffee", bg: "kafe", cyr: "кафе" },
      { en: "beer", bg: "bira", cyr: "бира" },
      { en: "wine", bg: "vino", cyr: "вино" },
      { en: "milk", bg: "mlyako", cyr: "мляко" },
      { en: "cheese", bg: "sirene", cyr: "сирене" },
      { en: "meat", bg: "meso", cyr: "месо" },
      { en: "apple", bg: "yabalka", cyr: "ябълка" },
      { en: "soup", bg: "supa", cyr: "супа" },
      { en: "salad", bg: "salata", cyr: "салата" },
      { en: "sugar", bg: "zahar", cyr: "захар" },
      { en: "salt", bg: "sol", cyr: "сол" },
      { en: "tea", bg: "chay", cyr: "чай" },
      { en: "the bill", bg: "smetkata", cyr: "сметката" },
    ],
  },
  {
    id: "travel",
    name: "Travel & places",
    emoji: "✈️",
    hue: 192,
    words: [
      { en: "airport", bg: "letishte", cyr: "летище" },
      { en: "train", bg: "vlak", cyr: "влак" },
      { en: "bus", bg: "avtobus", cyr: "автобус" },
      { en: "ticket", bg: "bilet", cyr: "билет" },
      { en: "hotel", bg: "hotel", cyr: "хотел" },
      { en: "street", bg: "ulitsa", cyr: "улица" },
      { en: "city", bg: "grad", cyr: "град" },
      { en: "left", bg: "lyavo", cyr: "ляво" },
      { en: "right", bg: "dyasno", cyr: "дясно" },
      { en: "straight ahead", bg: "napravo", cyr: "направо" },
      { en: "map", bg: "karta", cyr: "карта" },
      { en: "beach", bg: "plazh", cyr: "плаж" },
      { en: "mountain", bg: "planina", cyr: "планина" },
      { en: "where is", bg: "kade e", cyr: "къде е" },
      { en: "station", bg: "gara", cyr: "гара" },
    ],
  },
  {
    id: "numbers",
    name: "Numbers & time",
    emoji: "🔢",
    hue: 142,
    words: [
      { en: "one", bg: "edno", cyr: "едно" },
      { en: "two", bg: "dve", cyr: "две" },
      { en: "three", bg: "tri", cyr: "три" },
      { en: "four", bg: "chetiri", cyr: "четири" },
      { en: "five", bg: "pet", cyr: "пет" },
      { en: "six", bg: "shest", cyr: "шест" },
      { en: "seven", bg: "sedem", cyr: "седем" },
      { en: "eight", bg: "osem", cyr: "осем" },
      { en: "nine", bg: "devet", cyr: "девет" },
      { en: "ten", bg: "deset", cyr: "десет" },
      { en: "today", bg: "dnes", cyr: "днес" },
      { en: "tomorrow", bg: "utre", cyr: "утре" },
      { en: "yesterday", bg: "vchera", cyr: "вчера" },
      { en: "day", bg: "den", cyr: "ден" },
      { en: "week", bg: "sedmitsa", cyr: "седмица" },
    ],
  },
];

export function getTheme(id: string): Theme | undefined {
  return THEMES.find((t) => t.id === id);
}

// Normalize an answer for comparison: trim, lowercase, collapse internal
// whitespace. Spelling must otherwise match exactly.
export function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}
