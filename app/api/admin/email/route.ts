import { emailUpdateSchema } from "@/lib/admin/email";
import { json } from "@/lib/server/http";
import { adminRead, adminWrite } from "@/lib/server/route";
import { readEmailView, saveEmail } from "@/lib/server/site-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The outgoing mail (SMTP) settings. The password is write-only: GET reports whether one is
// set and its last four characters.
export const GET = adminRead(async () => json(await readEmailView()));
export const PUT = adminWrite({ maxBytes: 4096, schema: emailUpdateSchema }, async ({ data }) => {
  await saveEmail(data);
  return json(await readEmailView());
});
