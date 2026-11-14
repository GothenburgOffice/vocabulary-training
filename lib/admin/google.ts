// The Google sign-in client (#152), as the admin page edits it: shared by
// app/api/admin/google and components/admin/GoogleSettings.
import { z } from "zod";
import type { KeyStatus } from "./ai-settings";
import { CLIENT_ID_PATTERN } from "@/lib/google-oidc";

export type GoogleView = {
  encryptionReady: boolean;
  clientId: string;
  // The secret is write-only: whether it is set, and its last four characters.
  secret: KeyStatus;
  // What to enter as the authorized redirect URI in the Google Cloud console.
  redirectUri: string;
  // On while a client ID and a readable secret are saved.
  enabled: boolean;
};

// clientSecret as for the Requesty keys: omitted keeps it, null clears it. A blank client ID
// switches Google sign-in off.
export const googleUpdateSchema = z
  .object({
    clientId: z
      .string()
      .trim()
      .max(200)
      .refine(
        (value) => !value || CLIENT_ID_PATTERN.test(value),
        "Enter the client ID from Google Cloud, ending in .apps.googleusercontent.com.",
      ),
    clientSecret: z.string().trim().min(1).max(500).nullable().optional(),
  })
  .strict();
export type GoogleUpdate = z.infer<typeof googleUpdateSchema>;
