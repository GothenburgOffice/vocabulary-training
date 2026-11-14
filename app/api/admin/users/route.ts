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
import { adminRead, adminWrite } from "@/lib/server/route";
import { HttpError, json } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = adminRead(async ({ request, admin }) => {
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
});

// One change to one account: its tier, a lock, or the trash (see changeAccount).
export const PATCH = adminWrite(
  { maxBytes: 4096, schema: accountChangeSchema },
  async ({ admin, data }) => {
    const account = await changeAccount(data, admin.id);
    return json(account ? { account } : { ok: true });
  },
);

// Deletes the E2E test accounts at once. Every other account is deleted through the trash.
export const DELETE = adminWrite(
  { maxBytes: 4096, schema: testAccountsDeleteSchema },
  // The schema only checks the confirmation; nothing else is read from the body.
  async ({ admin }) => json({ deleted: await deleteTestAccounts(admin.id) }),
);
