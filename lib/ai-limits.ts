// The abuse limits for the AI features (#82): how many letters an account may send per minute
// and per day, per feature and account type, plus the speech request block and the cooldowns.
// They are site settings ("limits.…" in site_settings, seeded by migration 008), so they can
// be changed in the database without a deploy; these defaults apply to any missing or invalid.
// A letter limit of 0 means no limit (for a site that caps spending only at the provider).
export type AiKind = "speech" | "note";
export type KindLimits = {
  lettersPerMinute: number;
  lettersPerDay: { basic: number; plus: number };
  cooldownMs: number;
};
export type AiLimits = { speech: KindLimits; note: KindLimits; speechBlockMs: number };

export const DEFAULT_LIMITS: AiLimits = {
  speech: {
    lettersPerMinute: 1_200,
    lettersPerDay: { basic: 100_000, plus: 300_000 },
    cooldownMs: 500,
  },
  note: {
    lettersPerMinute: 3_000,
    lettersPerDay: { basic: 100_000, plus: 300_000 },
    cooldownMs: 3_000,
  },
  speechBlockMs: 10_000,
};

// The range each limit may take: what the database is read with, and what admin may save, so
// any value shown can also be saved.
export const LIMIT_BOUNDS = {
  letters: { min: 0, max: 999_999_999 },
  cooldownMs: { min: 0, max: 600_000 },
  blockSeconds: { min: 1, max: 300 },
};

// A setting's value: a whole number within its bounds, or the default.
function count(
  settings: Map<string, string>,
  key: string,
  fallback: number,
  bounds: { min: number; max: number },
) {
  const value = settings.get(key)?.trim();
  if (!value || !/^\d{1,9}$/.test(value)) return fallback;
  const number = Number(value);
  return number >= bounds.min && number <= bounds.max ? number : fallback;
}
function kind(settings: Map<string, string>, name: AiKind): KindLimits {
  const d = DEFAULT_LIMITS[name];
  const key = (rest: string) => `limits.${name}.${rest}`;
  return {
    lettersPerMinute: count(
      settings,
      key("letters_per_minute"),
      d.lettersPerMinute,
      LIMIT_BOUNDS.letters,
    ),
    lettersPerDay: {
      basic: count(
        settings,
        key("letters_per_day.basic"),
        d.lettersPerDay.basic,
        LIMIT_BOUNDS.letters,
      ),
      plus: count(
        settings,
        key("letters_per_day.plus"),
        d.lettersPerDay.plus,
        LIMIT_BOUNDS.letters,
      ),
    },
    cooldownMs: count(settings, key("cooldown_ms"), d.cooldownMs, LIMIT_BOUNDS.cooldownMs),
  };
}
export function parseLimits(settings: Map<string, string>): AiLimits {
  return {
    speech: kind(settings, "speech"),
    note: kind(settings, "note"),
    speechBlockMs:
      count(
        settings,
        "limits.speech.request_block_seconds",
        DEFAULT_LIMITS.speechBlockMs / 1000,
        LIMIT_BOUNDS.blockSeconds,
      ) * 1000,
  };
}
// An unknown account type gets the basic budget.
export const dailyLetters = (limits: KindLimits, tier: string) =>
  tier === "plus" ? limits.lettersPerDay.plus : limits.lettersPerDay.basic;
