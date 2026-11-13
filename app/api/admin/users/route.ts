import {
  accountChangeSchema,
  testAccountsDeleteSchema,
  TRASH_DAYS,
  USERS_PAGE_SIZE,
  userListQuerySchema,
} from "@/lib/admin/users";
import {
  changeAccount,
  deleteTestAccounts,
  listAccounts,
  purgeTrashedAccounts,
} from "@/lib/server/accounts";
import { readLimits } from "@/lib/server/ai-limits";
import { requireAdmin } from "@/lib/server/auth";
import { body, fail, HttpError, json, requireOrigin } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const admin = await requireAdmin();
    const parsed = userListQuerySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
    // Expired trash goes before the first page is read, so the list never shows an account past
    // its date. Later pages append to that same view, so search-as-you-type and "Load more"
    // don't each issue a DELETE.
    if (parsed.data.offset === 0)
      await purgeTrashedAccounts().catch((e) =>
        console.error("Trash purge failed:", e instanceof Error ? e.name : "unknown"),
      );
    const [list, limits] = await Promise.all([listAccounts(parsed.data, admin.id), readLimits()]);
    return json({
      viewerId: admin.id,
      ...list,
      limits,
      pageSize: USERS_PAGE_SIZE,
      trashDays: TRASH_DAYS,
    });
  } catch (e) {
    return fail(e);
  }
}

// One change to one account: its tier, a lock, or the trash (see changeAccount).
export async function PATCH(request: Request) {
  try {
    requireOrigin(request);
    const admin = await requireAdmin();
    const parsed = accountChangeSchema.safeParse(await body(request, 4096));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
    const account = await changeAccount(parsed.data, admin.id);
    return json(account ? { account } : { ok: true });
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
    return json({ deleted: await deleteTestAccounts(admin.id) });
  } catch (e) {
    return fail(e);
  }
}
