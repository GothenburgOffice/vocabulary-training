// The outgoing mail (SMTP) settings, as the admin page edits them: shared by
// app/api/admin/email and components/admin/EmailSettings. Mail is for sign-up and password
// reset messages.
import { z } from "zod";
import type { KeyStatus } from "./ai-settings";

export const SMTP_SECURITY = ["starttls", "tls", "none"] as const;
export type SmtpSecurity = (typeof SMTP_SECURITY)[number];
export const SMTP_SECURITY_LABELS: Record<SmtpSecurity, string> = {
  starttls: "STARTTLS (usually port 587)",
  tls: "TLS from the start (usually port 465)",
  none: "None (test stacks only)",
};
export const DEFAULT_PORT: Record<SmtpSecurity, number> = { starttls: 587, tls: 465, none: 25 };

export type EmailView = {
  encryptionReady: boolean;
  host: string;
  port: number;
  security: SmtpSecurity;
  user: string;
  // The password is write-only: whether it is set, and its last four characters.
  password: KeyStatus;
  from: string;
  // Whether "None" is offered: test and local stacks only (lib/smtp.ts).
  plaintextAllowed: boolean;
  // On while a host and a from address are saved.
  enabled: boolean;
};

const noControl = (value: string) => !/[\u0000-\u001f\u007f]/u.test(value);
// "name@example.com" or "Name <name@example.com>": what goes in the From header.
const FROM_PATTERN =
  /^(?:[^<>\r\n]{1,100}<[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>|[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)$/u;

// password as for the Requesty keys: omitted keeps it, null clears it. A blank host switches
// mail off.
export const emailUpdateSchema = z
  .object({
    host: z
      .string()
      .trim()
      .max(253)
      .refine((value) => !value || /^[A-Za-z0-9.-]+$/u.test(value), "Enter a host name only."),
    port: z.number().int().min(1).max(65535),
    security: z.enum(SMTP_SECURITY),
    user: z.string().trim().max(254).refine(noControl, "Remove control characters."),
    password: z
      .string()
      .min(1)
      .max(500)
      .refine(noControl, "Remove control characters.")
      .nullable()
      .optional(),
    from: z
      .string()
      .trim()
      .max(254)
      .refine(
        (value) => !value || FROM_PATTERN.test(value),
        "Enter an address like Name <you@example.com>.",
      ),
  })
  .strict();
export type EmailUpdate = z.infer<typeof emailUpdateSchema>;

export const testMailSchema = z.object({ to: z.string().trim().email().max(254) }).strict();
