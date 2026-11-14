import { checkDatabase } from "@/lib/server/db";
import { json } from "@/lib/server/http";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await checkDatabase();
    return json({ status: "ok" });
  } catch {
    return json({ status: "unavailable" }, 503);
  }
}
