import { googleUpdateSchema } from "@/lib/admin/google";
import { json } from "@/lib/server/http";
import { adminRead, adminWrite } from "@/lib/server/route";
import { readGoogleView, saveGoogle } from "@/lib/server/site-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The Google sign-in client (#152). The secret is write-only: GET reports whether one is set
// and its last four characters.
export const GET = adminRead(async () => json(await readGoogleView()));
export const PUT = adminWrite({ maxBytes: 4096, schema: googleUpdateSchema }, async ({ data }) => {
  await saveGoogle(data);
  return json(await readGoogleView());
});
