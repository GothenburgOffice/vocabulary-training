import { registrationBlockers, registrationUpdateSchema } from "@/lib/admin/registration";
import { adminRead, adminWrite } from "@/lib/server/route";
import { HttpError, json } from "@/lib/server/http";
import { readRegistration, saveRegistration } from "@/lib/server/site-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = adminRead(async () => {
  return json(await readRegistration());
});
// Registration can only be switched on once its checklist is complete for the values saved.
export const PUT = adminWrite(
  { maxBytes: 4096, schema: registrationUpdateSchema },
  async ({ data }) => {
    const blockers = registrationBlockers(data, process.env.APP_ORIGIN ?? "");
    if (data.open && blockers.length)
      throw new HttpError(400, `Registration can't open yet. ${blockers.join(" ")}`);
    await saveRegistration(data);
    return json(await readRegistration());
  },
);
