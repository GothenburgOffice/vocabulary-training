import { testMailSchema } from "@/lib/admin/email";
import { json } from "@/lib/server/http";
import { sendMail } from "@/lib/server/mailer";
import { adminWrite } from "@/lib/server/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sends a test mail to the address entered, with the saved settings.
export const POST = adminWrite({ maxBytes: 1024, schema: testMailSchema }, async ({ data }) => {
  await sendMail({
    to: data.to,
    subject: "Test mail from vocabulary.training",
    text: "This is a test mail. If you can read it, the outgoing mail settings work.",
  });
  return json({ sent: true });
});
