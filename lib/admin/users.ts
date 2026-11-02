import { z } from "zod";

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

export function canDeleteAccount(isAdmin: boolean, hasOtherAdmin: boolean) {
  return !isAdmin || hasOtherAdmin;
}

export function isE2eAccountEmail(email: string) {
  return /^e2e-.+@example\.test$/i.test(email);
}
