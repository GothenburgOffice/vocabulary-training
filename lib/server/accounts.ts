import "server-only";
import { TRASH_DAYS } from "../admin/users";
import { db } from "./db";

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
