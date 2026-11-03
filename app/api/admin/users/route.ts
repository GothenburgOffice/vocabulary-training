import {
  accountChangeSchema,
  canRemoveAccess,
  E2E_EMAIL_PATTERN,
  escapeLike,
  testAccountsDeleteSchema,
  TRASH_DAYS,
  USERS_PAGE_SIZE,
  userListQuerySchema,
  type UserSort,
} from "../../../../lib/admin/users";
import { purgeTrashedAccounts } from "../../../../lib/server/accounts";
import { readLimits } from "../../../../lib/server/ai-limits";
import { requireAdmin } from "../../../../lib/server/auth";
import { body, fail, HttpError, json, requireOrigin } from "../../../../lib/server/http";
import { db } from "../../../../lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Calls and letters per feature over the last day, week and 90 days (the window kept).
const USAGE_COLUMNS = (["speech", "note"] as const).flatMap((kind) =>
  (
    [
      ["day", "AND at > now()-interval '1 day'"],
      ["week", "AND at > now()-interval '7 days'"],
      ["90", ""],
    ] as const
  ).flatMap(([period, window]) => [
    {
      name: `${kind}_calls_${period}`,
      sum: `count(*) FILTER (WHERE kind='${kind}' ${window})::int AS ${kind}_calls_${period}`,
    },
    {
      name: `${kind}_letters_${period}`,
      sum: `coalesce(sum(letters) FILTER (WHERE kind='${kind}' ${window}), 0)::bigint AS ${kind}_letters_${period}`,
    },
  ]),
);

const ACCOUNT_COLUMNS =
  "u.id, u.email, u.created_at, u.last_sign_in_at, u.ai_tier, u.is_admin, u.locked_at, u.deleted_at";

// What each sortable column orders by, for accounts as `u` and their usage as `us`. Status:
// active, then locked, then in the trash.
const SORT_SQL: Record<UserSort, string> = {
  email: "u.email",
  tier: "u.ai_tier",
  status:
    "CASE WHEN u.deleted_at IS NOT NULL THEN 2 WHEN u.locked_at IS NOT NULL THEN 1 ELSE 0 END",
  created: "u.created_at",
  lastSignIn: "u.last_sign_in_at",
  speech: "coalesce(us.speech_letters_90, 0)",
  note: "coalesce(us.note_letters_90, 0)",
};

// One page of accounts with their usage. Usage is summed only for the accounts it's needed for:
// those on the page, or, when sorting by usage, those matching the filter (the page can only be
// cut once their usage is known). The sort column and direction come from fixed lists, never
// from the request text; `where` holds only bound parameters.
function accountPageQuery(where: string, sort: UserSort, dir: "asc" | "desc", limit: string) {
  const order = `${SORT_SQL[sort]} ${dir === "asc" ? "ASC" : "DESC"} NULLS LAST, u.email, u.id`;
  const usage = (accounts: string) => `usage AS (
       SELECT user_id, ${USAGE_COLUMNS.map((c) => c.sum).join(", ")}
       FROM ai_usage
       WHERE at > now()-interval '90 days' AND user_id IN (${accounts})
       GROUP BY user_id
     )`;
  const usageColumns = USAGE_COLUMNS.map((c) => `coalesce(us.${c.name}, 0) AS ${c.name}`).join(
    ", ",
  );
  if (sort === "speech" || sort === "note")
    return `WITH ${usage(`SELECT u.id FROM users u ${where}`)}
       SELECT ${ACCOUNT_COLUMNS}, ${usageColumns}
       FROM users u LEFT JOIN usage us ON us.user_id=u.id
       ${where}
       ORDER BY ${order}
       ${limit}`;
  return `WITH page AS (
       SELECT ${ACCOUNT_COLUMNS} FROM users u ${where} ORDER BY ${order} ${limit}
     ), ${usage("SELECT id FROM page")}
     SELECT ${ACCOUNT_COLUMNS}, ${usageColumns}
     FROM page u LEFT JOIN usage us ON us.user_id=u.id
     ORDER BY ${order}`;
}

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
    const { q, scope, offset, sort, dir } = parsed.data;
    // Expired trash goes before the first page is read, so the list never shows an account past
    // its date. Later pages append to that same view, so search-as-you-type and "Load more"
    // don't each issue a DELETE.
    if (offset === 0)
      await purgeTrashedAccounts().catch((e) =>
        console.error("Trash purge failed:", e instanceof Error ? e.name : "unknown"),
      );
    const filter = accountFilter(q, scope);
    const limitParam = filter.params.length + 1;
    const offsetParam = filter.params.length + 2;
    const pageParams = [...filter.params, USERS_PAGE_SIZE, offset];

    const [page, total, testAccounts, limits] = await Promise.all([
      db.query(
        accountPageQuery(filter.where, sort, dir, `LIMIT $${limitParam} OFFSET $${offsetParam}`),
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
      // Unreachable for a single request (the actor is an active admin other than the target),
      // but it is what stops two admins who lock each other at the same moment: the advisory
      // lock runs them one after the other, and the second finds no other active admin left.
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
