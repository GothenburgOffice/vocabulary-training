// Registration and the privacy details it depends on: shapes shared by
// app/api/admin/registration, the admin page, the public /privacy page and sign-up.
import { z } from "zod";

export type Privacy = { controllerName: string; contactEmail: string };
export type RegistrationView = Privacy & { open: boolean; blockers: string[] };

// The sign-in email rule (credentialsSchema), so a contact that works as an address passes.
const email = z.string().trim().email().max(254);
const noControl = (value: string) => !/[\u0000-\u001f\u007f]/u.test(value);

// Blank privacy values are allowed: they keep registration closed until real details are in.
export const registrationUpdateSchema = z
  .object({
    open: z.boolean(),
    controllerName: z.string().trim().max(200).refine(noControl, "Remove control characters."),
    contactEmail: z
      .string()
      .trim()
      .max(254)
      .refine((value) => !value || email.safeParse(value).success, "Enter a valid email address."),
  })
  .strict();

export function privacyReady(privacy: Privacy) {
  return !!privacy.controllerName.trim() && email.safeParse(privacy.contactEmail).success;
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
// What must be in place before anyone can register; empty means ready. The email address is
// personal data, so the controller and a contact are published first (GDPR article 13), and
// passwords only travel over HTTPS, except to a local address. Add new requirements here.
export function registrationBlockers(privacy: Privacy, appOrigin: string): string[] {
  const blockers: string[] = [];
  if (!privacy.controllerName.trim()) blockers.push("Enter the data controller.");
  if (!email.safeParse(privacy.contactEmail).success)
    blockers.push("Enter a valid privacy contact email.");
  let url: URL | null = null;
  try {
    url = new URL(appOrigin);
  } catch {
    /* Not set or not a URL: blocked below. */
  }
  if (!url || (url.protocol !== "https:" && !LOOPBACK.has(url.hostname)))
    blockers.push("Serve the site over HTTPS: APP_ORIGIN must start with https://.");
  return blockers;
}
