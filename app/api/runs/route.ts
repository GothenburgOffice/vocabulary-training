import { json } from "@/lib/server/http";
import { userWrite } from "@/lib/server/route";
import { runSaveSchema } from "@/lib/validation";
import { addRun } from "@/lib/server/workspace-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A completed practice session.
export const POST = userWrite(
  { maxBytes: 4_000_000, schema: runSaveSchema, invalid: "This session contains invalid data." },
  async ({ user, data }) => {
    await addRun(user.id, data);
    return json({ saved: true });
  },
);
