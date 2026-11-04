// The write limit: how many changes one account may save per hour and per day, across every
// route that writes its data (reviews, sessions, lists, profile, reports and the AI calls). It
// is there to stop a script, so it is set far above what a person could reach even answering
// as fast as possible for 24 hours. Site settings "limits.writes.…" (Admin → Limits); these
// defaults apply to any missing or invalid. 0 means no limit.
import { z } from "zod";

export type WriteLimits = { perHour: number; perDay: number };
export const DEFAULT_WRITE_LIMITS: WriteLimits = { perHour: 20_000, perDay: 300_000 };
export const WRITE_LIMIT_BOUNDS = { min: 0, max: 99_999_999 };

const limit = z.number().int().min(WRITE_LIMIT_BOUNDS.min).max(WRITE_LIMIT_BOUNDS.max);
export const writeLimitsSchema = z.object({ perHour: limit, perDay: limit }).strict();

export function parseWriteLimits(settings: Map<string, string>): WriteLimits {
  const read = (key: string, fallback: number) => {
    const value = settings.get(key)?.trim();
    if (!value || !/^\d{1,8}$/.test(value)) return fallback;
    return Number(value);
  };
  return {
    perHour: read("limits.writes.per_hour", DEFAULT_WRITE_LIMITS.perHour),
    perDay: read("limits.writes.per_day", DEFAULT_WRITE_LIMITS.perDay),
  };
}
export const writeLimitsToSettings = (l: WriteLimits): [string, string][] => [
  ["limits.writes.per_hour", String(l.perHour)],
  ["limits.writes.per_day", String(l.perDay)],
];

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
type Window = { start: number; count: number };
// Counts per account, in this server process (the app runs as one). Each window starts with
// the account's first write in it. A restart starts the counts again, which only lets a
// script go on a little longer.
export class WriteLimiter {
  private accounts = new Map<string, { hour: Window; day: Window }>();
  // Counts one write; false when it would go over either limit (then it isn't counted).
  take(userId: string, now: number, limits: WriteLimits) {
    if (this.accounts.size > 10_000) this.prune(now);
    const entry = this.accounts.get(userId) ?? {
      hour: { start: now, count: 0 },
      day: { start: now, count: 0 },
    };
    if (now - entry.hour.start >= HOUR) entry.hour = { start: now, count: 0 };
    if (now - entry.day.start >= DAY) entry.day = { start: now, count: 0 };
    this.accounts.set(userId, entry);
    if (
      (limits.perHour > 0 && entry.hour.count >= limits.perHour) ||
      (limits.perDay > 0 && entry.day.count >= limits.perDay)
    )
      return false;
    entry.hour.count += 1;
    entry.day.count += 1;
    return true;
  }
  private prune(now: number) {
    for (const [id, entry] of this.accounts)
      if (now - entry.day.start >= DAY) this.accounts.delete(id);
  }
}
