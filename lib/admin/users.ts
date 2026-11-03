import { z } from "zod";

export const USERS_PAGE_SIZE = 50;

// An account in the trash is locked at once and deleted with all its data this many days later.
export const TRASH_DAYS = 30;

// One source for the test-account rule: the list filter, the cleanup query and the UI all use it.
export const E2E_EMAIL_PATTERN = "^e2e-.+@example[.]test$";

const userId = z.string().uuid();

// One change to one account: its tier, its lock, or whether it is in the trash.
export const accountChangeSchema = z.union([
  z.object({ userId, tier: z.enum(["basic", "plus"]) }).strict(),
  z.object({ userId, locked: z.boolean() }).strict(),
  z.object({ userId, trashed: z.boolean() }).strict(),
]);
export type AccountChange = z.infer<typeof accountChangeSchema>;

// Only the E2E test accounts are deleted at once; every other account goes through the trash.
export const testAccountsDeleteSchema = z.object({ testAccounts: z.literal(true) }).strict();

// The account list's sortable columns; speech and note sort by letters in the last 90 days.
export const USER_SORTS = [
  "email",
  "tier",
  "status",
  "created",
  "lastSignIn",
  "speech",
  "note",
] as const;
export type UserSort = (typeof USER_SORTS)[number];

export const userListQuerySchema = z.object({
  q: z.string().trim().max(200).default(""),
  scope: z.enum(["all", "regular", "test", "trash"]).default("all"),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
  sort: z.enum(USER_SORTS).default("created"),
  dir: z.enum(["asc", "desc"]).default("desc"),
});

// Locking or trashing an admin needs another admin who can still sign in, so the site never
// loses its last one.
export function canRemoveAccess(isAdmin: boolean, hasOtherActiveAdmin: boolean) {
  return !isAdmin || hasOtherActiveAdmin;
}

// When an account moved to the trash at `deletedAt` is deleted for good.
export function purgeDate(deletedAt: string | Date) {
  return new Date(new Date(deletedAt).getTime() + TRASH_DAYS * 24 * 60 * 60 * 1000);
}

export function isE2eAccountEmail(email: string) {
  return new RegExp(E2E_EMAIL_PATTERN, "i").test(email);
}

// Escapes LIKE wildcards so a search for "100%" or "a_b" matches literally.
export function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

// Whether the account's next call of a kind is refused: the server charges a call only while
// the last 24 hours' letters plus the call's stay within the daily budget (0: no limit).
export function dailyLimitReached(lettersToday: number, dailyBudget: number) {
  return dailyBudget > 0 && lettersToday >= dailyBudget;
}

// One account as the admin list returns it: its details and its AI usage per feature and period
// (bigint sums arrive as strings).
export type UsageKind = "speech" | "note";
export type UsagePeriod = "day" | "week" | "90";
export type AdminAccount = {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  ai_tier: "basic" | "plus";
  is_admin: boolean;
  locked_at: string | null;
  deleted_at: string | null;
} & Record<`${UsageKind}_${"calls" | "letters"}_${UsagePeriod}`, number | string>;
export type Usage = Record<UsagePeriod, { calls: number; letters: number }>;

export function accountUsage(account: AdminAccount, kind: UsageKind): Usage {
  const period = (name: UsagePeriod) => ({
    calls: Number(account[`${kind}_calls_${name}`]),
    letters: Number(account[`${kind}_letters_${name}`]),
  });
  return { day: period("day"), week: period("week"), 90: period("90") };
}

// Active, locked or in the trash (which also locks it).
export function accountState(account: Pick<AdminAccount, "locked_at" | "deleted_at">) {
  return account.deleted_at ? "Trash" : account.locked_at ? "Locked" : "Active";
}
