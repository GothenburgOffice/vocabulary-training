import {
  accountChangeSchema,
  canRemoveAccess,
  E2E_EMAIL_PATTERN,
  escapeLike,
  testAccountsDeleteSchema,
  TRASH_DAYS,
  USERS_PAGE_SIZE,
  userListQuerySchema,
} from "../../../../lib/admin/users";
import { purgeTrashedAccounts } from "../../../../lib/server/accounts";
import { readLimits } from "../../../../lib/server/ai-limits";
import { requireAdmin } from "../../../../lib/server/auth";
import { body, fail, HttpError, json, requireOrigin } from "../../../../lib/server/http";
import { db } from "../../../../lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Filters for the account list. Values are bound as parameters; the e2e pattern is a constant.
function accountFilter(q: string, scope: "all" | "regular" | "test" | "trash") {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (scope === "test") clauses.push(`u.email ~* '${E2E_EMAIL_PATTERN}'`);
  if (scope === "regular") clauses.push(`u.email !~* '${E2E_EMAIL_PATTERN}'`);
  if (scope === "trash") clauses.push("u.deleted_at IS NOT NULL");
  if (q) {
    params.push(`%${escapeLike(q)}%`);
    clauses.push(`u.email ILIKE $${params.length} ESCAPE '\\'`);
  }
  return { where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

export async function GET(request: Request) {
  try {
    const admin = await requireAdmin();
    const parsed = userListQuerySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
    // Expired trash goes before the list is read, so it never shows accounts past their date.
    await purgeTrashedAccounts().catch((e) =>
      console.error("Trash purge failed:", e instanceof Error ? e.name : "unknown"),
    );
    const { q, scope, offset } = parsed.data;
    const filter = accountFilter(q, scope);
    const limitParam = filter.params.length + 1;
    const offsetParam = filter.params.length + 2;
    const pageParams = [...filter.params, USERS_PAGE_SIZE, offset];

    const [page, total, testAccounts, limits] = await Promise.all([
      db.query(
        `WITH page AS (
           SELECT u.id, u.email, u.created_at, u.last_sign_in_at, u.ai_tier, u.is_admin,
             u.locked_at, u.deleted_at
           FROM users u ${filter.where}
           ORDER BY u.created_at DESC, u.email, u.id
           LIMIT $${limitParam} OFFSET $${offsetParam}
         )
         SELECT p.id, p.email, p.created_at, p.last_sign_in_at, p.ai_tier, p.is_admin,
           p.locked_at, p.deleted_at,
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
         FROM page p
         LEFT JOIN ai_usage a ON a.user_id=p.id AND a.at > now()-interval '90 days'
         GROUP BY p.id, p.email, p.created_at, p.last_sign_in_at, p.ai_tier, p.is_admin,
           p.locked_at, p.deleted_at
         ORDER BY p.created_at DESC, p.email, p.id`,
        pageParams,
      ),
      db.query(`SELECT count(*)::int AS n FROM users u ${filter.where}`, filter.params),
      db.query(
        `SELECT count(*)::int AS n FROM users
         WHERE email ~* '${E2E_EMAIL_PATTERN}' AND NOT is_admin AND id<>$1`,
        [admin.id],
      ),
      readLimits(),
    ]);
    return json({
      viewerId: admin.id,
      accounts: page.rows,
      limits,
      total: total.rows[0].n,
      testAccounts: testAccounts.rows[0].n,
      pageSize: USERS_PAGE_SIZE,
      trashDays: TRASH_DAYS,
    });
  } catch (e) {
    return fail(e);
  }
}

// One change to one account: its tier, a lock, or the trash. Locking or trashing ends the
// account's sessions at once; unlocking or restoring lets it sign in again.
export async function PATCH(request: Request) {
  try {
    requireOrigin(request);
    const admin = await requireAdmin();
    const parsed = accountChangeSchema.safeParse(await body(request, 4096));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
    const change = parsed.data;

    if ("tier" in change) {
      const result = await db.query("UPDATE users SET ai_tier=$2 WHERE id=$1 RETURNING id", [
        change.userId,
        change.tier,
      ]);
      if (!result.rowCount) throw new HttpError(404, "Account not found.");
      return json({ ok: true });
    }

    const removing = "locked" in change ? change.locked : change.trashed;
    if (removing && change.userId === admin.id)
      throw new HttpError(400, "You can't lock or delete your own account.");
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      // One access change at a time, so two admins can't each remove the other.
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('admin:user-access', 0))");
      const target = await client.query("SELECT is_admin FROM users WHERE id=$1 FOR UPDATE", [
        change.userId,
      ]);
      if (!target.rowCount) throw new HttpError(404, "Account not found.");
      if (removing && target.rows[0].is_admin) {
        const other = await client.query(
          `SELECT 1 FROM users
           WHERE is_admin AND id<>$1 AND locked_at IS NULL AND deleted_at IS NULL LIMIT 1`,
          [change.userId],
        );
        if (!canRemoveAccess(true, Boolean(other.rowCount)))
          throw new HttpError(409, "The last admin who can sign in can't be locked or deleted.");
      }
      const column = "locked" in change ? "locked_at" : "deleted_at";
      const updated = await client.query(
        `UPDATE users SET ${column} = CASE WHEN $2 THEN coalesce(${column}, now()) ELSE NULL END
         WHERE id=$1 RETURNING id, locked_at, deleted_at`,
        [change.userId, removing],
      );
      if (removing) await client.query("DELETE FROM sessions WHERE user_id=$1", [change.userId]);
      await client.query("COMMIT");
      return json({ account: updated.rows[0] });
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

// Deletes the E2E test accounts at once. Every other account is deleted through the trash.
export async function DELETE(request: Request) {
  try {
    requireOrigin(request);
    const admin = await requireAdmin();
    const parsed = testAccountsDeleteSchema.safeParse(await body(request, 4096));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
    const result = await db.query(
      `DELETE FROM users WHERE email ~* '${E2E_EMAIL_PATTERN}' AND NOT is_admin AND id<>$1 RETURNING id`,
      [admin.id],
    );
    return json({ deleted: result.rowCount ?? 0 });
  } catch (e) {
    return fail(e);
  }
}
