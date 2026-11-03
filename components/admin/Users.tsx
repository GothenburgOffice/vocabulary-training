"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { dailyLetters, type AiLimits } from "../../lib/ai-limits";
import type { Sort } from "../../lib/admin/sort";
import {
  accountState,
  accountUsage,
  purgeDate,
  type AdminAccount as Account,
  type UserSort,
} from "../../lib/admin/users";
import Dialog from "../workspace/Dialog";
import { adminRequest } from "./request";
import SortHeader from "./SortHeader";
import UsageCell from "./UsageCell";
import UserCard, { type AccessChange } from "./UserCard";

type View = {
  viewerId: string;
  accounts: Account[];
  limits: AiLimits;
  total: number;
  testAccounts: number;
  pageSize: number;
  trashDays: number;
};
const KINDS = [
  { kind: "speech", label: "Speech" },
  { kind: "note", label: "Language notes" },
] as const;
const date = (value: string) => new Date(value).toLocaleString();
const day = (value: string | Date) =>
  new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

// The account list: a read-only table, one row per account. A row opens the account's card,
// where its type and access are changed.
export default function Users() {
  const [view, setView] = useState<View | null>(null);
  const [filter, setFilter] = useState("");
  const [accountFilter, setAccountFilter] = useState("all");
  // Newest first until a heading is clicked; the server sorts, since the list loads in pages.
  const [sort, setSort] = useState<Sort<UserSort>>({ key: "created", dir: "desc" });
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  // The account whose card is open.
  const [openId, setOpenId] = useState<string | null>(null);
  // Only the newest request may write the list, so a slow earlier search cannot overwrite a later one.
  const latestRequest = useRef(0);

  const loadPage = useCallback(
    async (q: string, scope: string, order: Sort<UserSort>, offset: number, append: boolean) => {
      const id = ++latestRequest.current;
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          q,
          scope,
          sort: order.key,
          dir: order.dir,
          offset: String(offset),
        });
        const next = await adminRequest<View>(`/api/admin/users?${params}`);
        if (id !== latestRequest.current) return;
        setView((current) =>
          append && current ? { ...next, accounts: [...current.accounts, ...next.accounts] } : next,
        );
      } catch (e) {
        if (id === latestRequest.current) setError((e as Error).message);
      } finally {
        if (id === latestRequest.current) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const timer = window.setTimeout(
      () => void loadPage(filter.trim(), accountFilter, sort, 0, false),
      250,
    );
    return () => window.clearTimeout(timer);
  }, [accountFilter, filter, sort, loadPage]);

  if (!view) return error ? <p className="error">{error}</p> : <p>Loading accounts…</p>;

  async function changeTier(account: Account, tier: Account["ai_tier"]) {
    setBusy(account.id);
    setError("");
    setStatus("");
    try {
      await adminRequest("/api/admin/users", "PATCH", { userId: account.id, tier });
      setView(
        (current) =>
          current && {
            ...current,
            accounts: current.accounts.map((user) =>
              user.id === account.id ? { ...user, ai_tier: tier } : user,
            ),
          },
      );
      setStatus(`Updated ${account.email}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // Locks or unlocks an account, or moves it to or from the trash.
  async function changeAccess(account: Account, change: AccessChange, trashDays: number) {
    if ("trashed" in change && change.trashed) {
      const when = purgeDate(new Date()).toLocaleDateString();
      if (
        !window.confirm(
          `Move ${account.email} to the trash? It is locked now, and it and all its data are deleted on ${when} (${trashDays} days) unless you restore it.`,
        )
      )
        return;
    }
    setBusy(account.id);
    setError("");
    setStatus("");
    try {
      const result = await adminRequest<{
        account: Pick<Account, "id" | "locked_at" | "deleted_at">;
      }>("/api/admin/users", "PATCH", { userId: account.id, ...change });
      setView(
        (current) =>
          current && {
            ...current,
            accounts: current.accounts.map((user) =>
              user.id === account.id ? { ...user, ...result.account } : user,
            ),
          },
      );
      setStatus(
        "locked" in change
          ? `${change.locked ? "Locked" : "Unlocked"} ${account.email}.`
          : change.trashed
            ? `Moved ${account.email} to the trash.`
            : `Restored ${account.email}.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function deleteTestAccounts(count: number) {
    if (
      !window.confirm(
        `Permanently delete ${count.toLocaleString("en")} E2E test accounts and all their data?`,
      )
    )
      return;
    setBusy("test-accounts");
    setError("");
    setStatus("");
    try {
      const result = await adminRequest<{ deleted: number }>("/api/admin/users", "DELETE", {
        testAccounts: true,
      });
      setStatus(`Deleted ${result.deleted.toLocaleString("en")} E2E test accounts.`);
      // Many accounts may have gone, so reload the first page with the current filters.
      await loadPage(filter.trim(), accountFilter, sort, 0, false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // A new card starts without the last one's message.
  function openAccount(id: string) {
    setStatus("");
    setError("");
    setOpenId(id);
  }

  const shown = view.accounts.length;
  const hasMore = shown < view.total;
  const opened = view.accounts.find((account) => account.id === openId) ?? null;

  return (
    <>
      <div className="users-toolbar">
        <label>
          Search by email
          <input value={filter} onChange={(event) => setFilter(event.target.value)} />
        </label>
        <label>
          Account filter
          <select value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)}>
            <option value="all">All accounts</option>
            <option value="regular">Non-test accounts</option>
            <option value="test">E2E test accounts</option>
            <option value="trash">In the trash</option>
          </select>
        </label>
        <button
          className="button danger"
          disabled={!view.testAccounts || busy !== null}
          onClick={() => void deleteTestAccounts(view.testAccounts)}
        >
          Delete test accounts ({view.testAccounts.toLocaleString("en")})
        </button>
      </div>
      <p className="field-help">
        Showing {shown.toLocaleString("en")} of {view.total.toLocaleString("en")} matching accounts.
        Speech and language notes show letters in the last 90 days, calls in brackets, and whether
        the daily limit blocks the account now; hover for every period. Click a heading to sort, and
        an account to see and change it.
      </p>
      {status && !opened && (
        <p className="admin-status" role="status">
          {status}
        </p>
      )}
      {error && !opened && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="admin-table-wrap">
        <table className="admin-table clickable-rows users-table">
          <thead>
            <tr>
              <SortHeader
                className="row-head"
                label="Email"
                sortKey="email"
                sort={sort}
                onSort={setSort}
              />
              <SortHeader label="Type" sortKey="tier" sort={sort} onSort={setSort} />
              <SortHeader label="Status" sortKey="status" sort={sort} onSort={setSort} />
              <SortHeader
                label="Created"
                sortKey="created"
                sort={sort}
                onSort={setSort}
                firstDir="desc"
              />
              <SortHeader
                label="Last sign-in"
                sortKey="lastSignIn"
                sort={sort}
                onSort={setSort}
                firstDir="desc"
              />
              {KINDS.map(({ kind, label }) => (
                <SortHeader
                  key={kind}
                  className="num"
                  label={label}
                  sortKey={kind}
                  sort={sort}
                  onSort={setSort}
                  firstDir="desc"
                  title={`${label}: letters in the last 90 days`}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {view.accounts.map((account) => (
              <tr
                key={account.id}
                className={account.deleted_at ? "is-trashed" : account.locked_at ? "is-locked" : ""}
                onClick={() => openAccount(account.id)}
              >
                <th scope="row" className="row-head user-email" title={account.email}>
                  {/* The row opens on a click anywhere; the button is the keyboard's way in. */}
                  <button
                    type="button"
                    className="row-open"
                    aria-haspopup="dialog"
                    onClick={(event) => {
                      event.stopPropagation();
                      openAccount(account.id);
                    }}
                  >
                    {account.email}
                  </button>
                  {account.is_admin && <small>admin</small>}
                  {account.id === view.viewerId && <small>you</small>}
                </th>
                <td className="cell">{account.ai_tier === "plus" ? "Plus" : "Basic"}</td>
                <td className="cell user-state">{accountState(account)}</td>
                <td className="cell" title={date(account.created_at)}>
                  {day(account.created_at)}
                </td>
                <td
                  className="cell"
                  title={account.last_sign_in_at ? date(account.last_sign_in_at) : undefined}
                >
                  {account.last_sign_in_at ? day(account.last_sign_in_at) : "–"}
                </td>
                {KINDS.map(({ kind, label }) => (
                  <UsageCell
                    key={kind}
                    label={label}
                    tier={account.ai_tier}
                    dailyBudget={dailyLetters(view.limits[kind], account.ai_tier)}
                    usage={accountUsage(account, kind)}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!shown && !loading && <p>No accounts match this filter.</p>}
      {loading && <p>Loading…</p>}
      {hasMore && !loading && (
        <button
          className="button admin-more"
          onClick={() => void loadPage(filter.trim(), accountFilter, sort, shown, true)}
        >
          Load more accounts
        </button>
      )}
      <Dialog title={opened ? opened.email : null} onClose={() => setOpenId(null)}>
        {opened && (
          <>
            {status && (
              <p className="admin-status" role="status">
                {status}
              </p>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <UserCard
              account={opened}
              viewerId={view.viewerId}
              limits={view.limits}
              busy={busy !== null}
              onTier={(tier) => void changeTier(opened, tier)}
              onAccess={(change) => void changeAccess(opened, change, view.trashDays)}
            />
          </>
        )}
      </Dialog>
    </>
  );
}
