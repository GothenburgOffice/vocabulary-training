import { db } from "../../../lib/server/db";
import { json } from "../../../lib/server/http";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await db.query("SELECT 1 FROM schema_migrations LIMIT 1");
    return json({ status: "ok" });
  } catch { return json({ status: "unavailable" }, 503); }
}
