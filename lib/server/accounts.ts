import "server-only";
import { randomUUID } from "node:crypto";
import {
  canRemoveAccess,
  E2E_EMAIL_PATTERN,
  escapeLike,
  TRASH_DAYS,
  USERS_PAGE_SIZE,
  type AccountChange,
  type UserListQuery,
  type UserSort,
} from "@/lib/admin/users";
import type { GoogleIdentity } from "@/lib/google-oidc";
import { db } from "./db";
import { HttpError } from "./http";

// Queries on the users table as accounts: sign-up, sign-in, and Admin → Users and Overview.
// The user data tables are in workspace-store.ts, sessions in auth.ts.

// Deletes every account that has been in the trash for TRASH_DAYS, with all its data (the
// foreign keys cascade). Run on an admin's sign-in and when Admin → Users opens, because the
// app has no scheduler. Returns how many accounts were deleted.
export async function purgeTrashedAccounts() {
  const result = await db.query(
    "DELETE FROM users WHERE deleted_at < now() - make_interval(days => $1)",
    [TRASH_DAYS],
  );
  return result.rowCount ?? 0;
}

// A new account with the default profile languages; lists start empty. An email that is
// already registered gets 409.
export async function createAccount(id: string, email: string, passwordHash: string) {
  await db
    .query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)", [id, email, passwordHash])
    .catch((e) => {
      if ((e as { code?: string }).code === "23505")
        throw new HttpError(409, "An account could not be created. Try signing in instead.");
      throw e;
    });
}

// What sign-in checks for an email, or undefined when there is no such account. A Google
// member has no password_hash, so a password never signs them in.
export async function findAccountForSignIn(email: string) {
  const result = await db.query<{
    id: string;
    password_hash: string | null;
    is_admin: boolean;
    locked_at: Date | null;
    deleted_at: Date | null;
  }>("SELECT id,password_hash,is_admin,locked_at,deleted_at FROM users WHERE email=$1", [email]);
  return result.rows[0];
}

// Why a Google sign-in was refused after Google proved who the person is.
export class GoogleSignInRefused extends Error {
  constructor(readonly reason: "closed" | "locked" | "linked") {
    super(reason);
  }
}

// The account a Google sign-in (#152) opens, following MoneyWorks: one account per address,
// one sign-in method per account.
// - Google's account ID (sub) already linked: that account.
// - Otherwise the account with the address Google proved: it is linked, its password removed
//   and every session ended. This app never verifies addresses, so a password account on that
//   address may be a stranger's who registered it first; Google just showed who owns it.
// - Otherwise a new account, only while registration is open (`registrationOpen`).
// A locked or trashed account is refused before anything changes. Every Google sign-in
// removes a password, also one the admin bootstrap gave back (scripts/admin-bootstrap.mjs).
export async function signInWithGoogle(
  identity: GoogleIdentity,
  registrationOpen: () => Promise<boolean>,
) {
  type Row = {
    id: string;
    is_admin: boolean;
    google_sub: string | null;
    locked_at: Date | null;
    deleted_at: Date | null;
  };
  const columns = "id,is_admin,google_sub,locked_at,deleted_at";
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    // One sign-in per address at a time, so two first sign-ins can't both link or create.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `google:${identity.email}`,
    ]);
    let user = (
      await client.query<Row>(`SELECT ${columns} FROM users WHERE google_sub=$1 FOR UPDATE`, [
        identity.sub,
      ])
    ).rows[0];
    const linking = !user;
    if (!user)
      user = (
        await client.query<Row>(`SELECT ${columns} FROM users WHERE email=$1 FOR UPDATE`, [
          identity.email,
        ])
      ).rows[0];
    if (user) {
      // The address belongs to an account linked to another Google account.
      if (linking && user.google_sub) throw new GoogleSignInRefused("linked");
      if (user.locked_at || user.deleted_at) throw new GoogleSignInRefused("locked");
      await client.query("UPDATE users SET google_sub=$2, password_hash=NULL WHERE id=$1", [
        user.id,
        identity.sub,
      ]);
      if (linking) await client.query("DELETE FROM sessions WHERE user_id=$1", [user.id]);
    } else {
      if (!(await registrationOpen())) throw new GoogleSignInRefused("closed");
      user = (
        await client.query<Row>(
          `INSERT INTO users(id,email,google_sub) VALUES($1,$2,$3) RETURNING ${columns}`,
          [randomUUID(), identity.email, identity.sub],
        )
      ).rows[0];
    }
    await client.query("COMMIT");
    return { userId: user.id, isAdmin: user.is_admin };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function recordSignIn(userId: string) {
  await db.query("UPDATE users SET last_sign_in_at=now() WHERE id=$1", [userId]);
}

// Accounts and admins on this server, for Admin → Overview.
export async function accountCounts() {
  const { rows } = await db.query<{ accounts: number; admins: number }>(
    "SELECT count(*)::int AS accounts, count(*) FILTER (WHERE is_admin)::int AS admins FROM users",
  );
  return rows[0];
}

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
  "u.id, u.email, u.created_at, u.last_sign_in_at, u.ai_tier, u.is_admin, u.locked_at, u.deleted_at, u.write_limited_at";

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
function accountFilter(q: string, scope: UserListQuery["scope"]) {
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

// One page of Admin → Users, the number of accounts matching the filter, and how many E2E test
// accounts the viewer could delete (never an admin, never the viewer).
export async function listAccounts(query: UserListQuery, viewerId: string) {
  const { q, scope, offset, sort, dir } = query;
  const filter = accountFilter(q, scope);
  const limitParam = filter.params.length + 1;
  const offsetParam = filter.params.length + 2;
  const pageParams = [...filter.params, USERS_PAGE_SIZE, offset];
  const [page, total, testAccounts] = await Promise.all([
    db.query(
      accountPageQuery(filter.where, sort, dir, `LIMIT $${limitParam} OFFSET $${offsetParam}`),
      pageParams,
    ),
    db.query(`SELECT count(*)::int AS n FROM users u ${filter.where}`, filter.params),
    db.query(
      `SELECT count(*)::int AS n FROM users
       WHERE email ~* '${E2E_EMAIL_PATTERN}' AND NOT is_admin AND id<>$1`,
      [viewerId],
    ),
  ]);
  return {
    accounts: page.rows,
    total: total.rows[0].n as number,
    testAccounts: testAccounts.rows[0].n as number,
  };
}

// One change to one account by an admin: its tier, a lock, or the trash. Locking or trashing
// ends the account's sessions at once; unlocking or restoring lets it sign in again. Returns the
// account's access columns for a lock or trash change, nothing for a tier change.
export async function changeAccount(change: AccountChange, adminId: string) {
  if ("tier" in change) {
    const result = await db.query("UPDATE users SET ai_tier=$2 WHERE id=$1 RETURNING id", [
      change.userId,
      change.tier,
    ]);
    if (!result.rowCount) throw new HttpError(404, "Account not found.");
    return undefined;
  }

  const removing = "locked" in change ? change.locked : change.trashed;
  if (removing && change.userId === adminId)
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
    return updated.rows[0];
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// Deletes the E2E test accounts at once, never an admin or the viewer. Every other account is
// deleted through the trash. Returns how many were deleted.
export async function deleteTestAccounts(viewerId: string) {
  const result = await db.query(
    `DELETE FROM users WHERE email ~* '${E2E_EMAIL_PATTERN}' AND NOT is_admin AND id<>$1 RETURNING id`,
    [viewerId],
  );
  return result.rowCount ?? 0;
}
