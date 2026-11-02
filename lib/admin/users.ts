import { z } from "zod";

export const USERS_PAGE_SIZE = 50;

// One source for the test-account rule: the list filter, the cleanup query and the UI all use it.
export const E2E_EMAIL_PATTERN = "^e2e-.+@example[.]test$";

export const tierChangeSchema = z
  .object({
    userId: z.string().uuid(),
    tier: z.enum(["basic", "plus"]),
  })
  .strict();

export const accountDeleteSchema = z.union([
  z.object({ userId: z.string().uuid() }).strict(),
  z.object({ testAccounts: z.literal(true) }).strict(),
]);

export const userListQuerySchema = z.object({
  q: z.string().trim().max(200).default(""),
  scope: z.enum(["all", "regular", "test"]).default("all"),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
});

export function canDeleteAccount(isAdmin: boolean, hasOtherAdmin: boolean) {
  return !isAdmin || hasOtherAdmin;
}

export function isE2eAccountEmail(email: string) {
  return new RegExp(E2E_EMAIL_PATTERN, "i").test(email);
}

// Escapes LIKE wildcards so a search for "100%" or "a_b" matches literally.
export function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}
