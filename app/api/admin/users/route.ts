import { accountDeleteSchema, tierChangeSchema } from "../../../../lib/admin/users";
import { readLimits } from "../../../../lib/server/ai-limits";
import { requireAdmin } from "../../../../lib/server/auth";
import { body, fail, HttpError, json, requireOrigin } from "../../../../lib/server/http";
import { db } from "../../../../lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const admin = await requireAdmin();
    const [accounts, limits] = await Promise.all([
      db.query(
        `SELECT u.id, u.email, u.created_at, u.last_sign_in_at, u.ai_tier, u.is_admin,
           count(a.at) FILTER (WHERE a.kind='speech' AND a.at > now()-interval '1 day')::int AS speech_calls_day,
           coalesce(sum(a.letters) FILTER (WHERE a.kind='speech' AND a.at > now()-interval '1 day'), 0)::bigint AS speech_letters_day,
           count(a.at) FILTER (WHERE a.kind='speech' AND a.at > now()-interval '7 days')::int AS speech_calls_week,
           coalesce(sum(a.letters) FILTER (WHERE a.kind='speech' AND a.at > now()-interval '7 days'), 0)::bigint AS speech_letters_week,
           count(a.at) FILTER (WHERE a.kind='speech')::int AS speech_calls_90,
           coalesce(sum(a.letters) FILTER (WHERE a.kind='speech'), 0)::bigint AS speech_letters_90,
           count(a.at) FILTER (WHERE a.kind='note' AND a.at > now()-interval '1 day')::int AS note_calls_day,
           coalesce(sum(a.letters) FILTER (WHERE a.kind='note' AND a.at > now()-interval '1 day'), 0)::bigint AS note_letters_day,
           count(a.at) FILTER (WHERE a.kind='note' AND a.at > now()-interval '7 days')::int AS note_calls_week,
           coalesce(sum(a.letters) FILTER (WHERE a.kind='note' AND a.at > now()-interval '7 days'), 0)::bigint AS note_letters_week,
           count(a.at) FILTER (WHERE a.kind='note')::int AS note_calls_90,
           coalesce(sum(a.letters) FILTER (WHERE a.kind='note'), 0)::bigint AS note_letters_90
         FROM users u
         LEFT JOIN ai_usage a ON a.user_id=u.id AND a.at > now()-interval '90 days'
         GROUP BY u.id
         ORDER BY u.created_at DESC, u.email`,
      ),
      readLimits(),
    ]);
    return json({ viewerId: admin.id, accounts: accounts.rows, limits });
  } catch (e) {
    return fail(e);
  }
}

export async function PATCH(request: Request) {
  try {
    requireOrigin(request);
    await requireAdmin();
    const parsed = tierChangeSchema.safeParse(await body(request, 4096));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
    const result = await db.query("UPDATE users SET ai_tier=$2 WHERE id=$1 RETURNING id", [
      parsed.data.userId,
      parsed.data.tier,
    ]);
    if (!result.rowCount) throw new HttpError(404, "Account not found.");
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(request: Request) {
  try {
    requireOrigin(request);
    const admin = await requireAdmin();
    const parsed = accountDeleteSchema.safeParse(await body(request, 4096));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);

    if ("testAccounts" in parsed.data) {
      const result = await db.query(
        "DELETE FROM users WHERE email ~* '^e2e-.+@example[.]test$' AND NOT is_admin AND id<>$1 RETURNING id",
        [admin.id],
      );
      return json({ deleted: result.rowCount ?? 0 });
    }

    if (parsed.data.userId === admin.id)
      throw new HttpError(400, "You can't delete your own account.");
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('admin:user-delete', 0))");
      const target = await client.query("SELECT is_admin FROM users WHERE id=$1 FOR UPDATE", [
        parsed.data.userId,
      ]);
      if (!target.rowCount) throw new HttpError(404, "Account not found.");
      if (target.rows[0].is_admin) {
        const otherAdmin = await client.query(
          "SELECT 1 FROM users WHERE is_admin AND id<>$1 LIMIT 1",
          [parsed.data.userId],
        );
        if (!otherAdmin.rowCount)
          throw new HttpError(409, "The last admin account cannot be deleted.");
      }
      await client.query("DELETE FROM users WHERE id=$1", [parsed.data.userId]);
      await client.query("COMMIT");
      return json({ deleted: 1 });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    return fail(e);
  }
}
