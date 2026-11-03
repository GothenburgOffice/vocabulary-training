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

export const userListQuerySchema = z.object({
  q: z.string().trim().max(200).default(""),
  scope: z.enum(["all", "regular", "test", "trash"]).default("all"),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
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
