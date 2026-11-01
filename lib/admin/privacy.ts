// The privacy controller and contact: shapes shared by app/api/admin/privacy, the admin page,
// the public /privacy page and registration.
import { z } from "zod";

export type Privacy = { controllerName: string; contactEmail: string };

// The sign-in email rule (credentialsSchema), so a contact that works as an address passes.
const email = z.string().trim().email().max(254);
const noControl = (value: string) => !/[\u0000-\u001f\u007f]/u.test(value);

// Blank values are allowed: they close registration until real details are entered.
export const privacyUpdateSchema = z
  .object({
    controllerName: z.string().trim().max(200).refine(noControl, "Remove control characters."),
    contactEmail: z
      .string()
      .trim()
      .max(254)
      .refine((value) => !value || email.safeParse(value).success, "Enter a valid email address."),
  })
  .strict();

// GDPR asks for the controller and a contact when personal data (the email address) is
// collected, so registration needs both.
export function privacyReady(privacy: Privacy) {
  return !!privacy.controllerName.trim() && email.safeParse(privacy.contactEmail).success;
}
