"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AiLimits } from "../../lib/ai-limits";
import { purgeDate } from "../../lib/admin/users";
import { adminRequest } from "./request";

type UsagePeriod = "day" | "week" | "90";
type UsageKind = "speech" | "note";
type Account = {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  ai_tier: "basic" | "plus";
  is_admin: boolean;
  locked_at: string | null;
  deleted_at: string | null;
} & Record<`${UsageKind}_${"calls" | "letters"}_${UsagePeriod}`, number | string>;
type View = {
  viewerId: string;
  accounts: Account[];
  limits: AiLimits;
  total: number;
  testAccounts: number;
  pageSize: number;
  trashDays: number;
};
const PERIODS: { name: UsagePeriod; label: string; short: string; days: number }[] = [
  { name: "day", label: "24 hours", short: "24 h", days: 1 },
  { name: "week", label: "7 days", short: "7 d", days: 7 },
  { name: "90", label: "90 days", short: "90 d", days: 90 },
];
const KINDS: { kind: UsageKind; label: string }[] = [
  { kind: "speech", label: "Speech" },
  { kind: "note", label: "Language notes" },
];
const number = (value: number | string) => Number(value).toLocaleString("en");
const compact = (value: number) =>
  value.toLocaleString("en", { notation: "compact", maximumFractionDigits: 1 });
const date = (value: string) => new Date(value).toLocaleString();
const day = (value: string | Date) =>
  new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export default function Users() {
  const [view, setView] = useState<View | null>(null);
  const [filter, setFilter] = useState("");
  const [accountFilter, setAccountFilter] = useState("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  // Only the newest request may write the list, so a slow earlier search cannot overwrite a later one.
  const latestRequest = useRef(0);

  const loadPage = useCallback(
    async (q: string, scope: string, offset: number, append: boolean) => {
      const id = ++latestRequest.current;
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ q, scope, offset: String(offset) });
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
      () => void loadPage(filter.trim(), accountFilter, 0, false),
      250,
    );
    return () => window.clearTimeout(timer);
  }, [accountFilter, filter, loadPage]);

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
  async function changeAccess(
    account: Account,
    change: { locked: boolean } | { trashed: boolean },
    trashDays: number,
  ) {
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
      await loadPage(filter.trim(), accountFilter, 0, false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const shown = view.accounts.length;
  const hasMore = shown < view.total;

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
        Usage is letters used of the period&apos;s budget, then calls in brackets: the budget is the
        account type&apos;s daily letter limit times the days, and no budget means unlimited.
      </p>
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
      <div className="admin-table-wrap">
        <table className="admin-table users-table">
          <thead>
            <tr>
              <th rowSpan={2} className="row-head">
                Email
              </th>
              <th rowSpan={2}>Type</th>
              <th rowSpan={2}>Status</th>
              <th rowSpan={2}>Created</th>
              <th rowSpan={2}>Last sign-in</th>
              {KINDS.map(({ kind, label }) => (
                <th key={kind} colSpan={PERIODS.length}>
                  {label}
                </th>
              ))}
              <th rowSpan={2}>
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
            <tr>
              {KINDS.flatMap(({ kind }) =>
                PERIODS.map((period) => (
                  <th key={`${kind}-${period.name}`} className="num" title={`Last ${period.label}`}>
                    {period.short}
                  </th>
                )),
              )}
            </tr>
          </thead>
          <tbody>
            {view.accounts.map((account) => (
              <tr
                key={account.id}
                className={account.deleted_at ? "is-trashed" : account.locked_at ? "is-locked" : ""}
              >
                <th scope="row" className="row-head user-email">
                  {account.email}
                  {account.is_admin && <small>admin</small>}
                  {account.id === view.viewerId && <small>you</small>}
                </th>
                <td>
                  <select
                    className="user-tier"
                    aria-label={`Account type for ${account.email}`}
                    value={account.ai_tier}
                    disabled={busy !== null}
                    onChange={(event) =>
                      void changeTier(account, event.target.value as Account["ai_tier"])
                    }
                  >
                    <option value="basic">Basic</option>
                    <option value="plus">Plus</option>
                  </select>
                </td>
                <td className="cell user-state">
                  {account.deleted_at ? (
                    <span title={`In the trash since ${date(account.deleted_at)}`}>
                      In the trash, deleted {day(purgeDate(account.deleted_at))}
                    </span>
                  ) : account.locked_at ? (
                    <span title={`Locked since ${date(account.locked_at)}. It can’t sign in.`}>
                      Locked since {day(account.locked_at)}
                    </span>
                  ) : (
                    "Active"
                  )}
                </td>
                <td className="cell" title={date(account.created_at)}>
                  {day(account.created_at)}
                </td>
                <td
                  className="cell"
                  title={account.last_sign_in_at ? date(account.last_sign_in_at) : undefined}
                >
                  {account.last_sign_in_at ? day(account.last_sign_in_at) : "–"}
                </td>
                {KINDS.flatMap(({ kind, label }) =>
                  PERIODS.map((period) => {
                    const calls = Number(account[`${kind}_calls_${period.name}`]);
                    const letters = Number(account[`${kind}_letters_${period.name}`]);
                    const budget = view.limits[kind].lettersPerDay[account.ai_tier] * period.days;
                    return (
                      <td
                        key={`${kind}-${period.name}`}
                        className="cell num usage"
                        title={`${label}, last ${period.label}: ${number(calls)} calls, ${number(letters)} of ${budget ? number(budget) : "unlimited"} letters`}
                      >
                        <span className={budget && letters > budget ? "over" : undefined}>
                          {number(letters)}
                        </span>
                        <small>
                          {budget ? ` / ${compact(budget)}` : ""} ({number(calls)})
                        </small>
                      </td>
                    );
                  }),
                )}
                <td>
                  {account.id !== view.viewerId && (
                    <div className="user-actions">
                      {!account.deleted_at && (
                        <button
                          className="button"
                          disabled={busy !== null}
                          aria-label={`${account.locked_at ? "Unlock" : "Lock"} account ${account.email}`}
                          onClick={() =>
                            void changeAccess(
                              account,
                              { locked: !account.locked_at },
                              view.trashDays,
                            )
                          }
                        >
                          {account.locked_at ? "Unlock" : "Lock"}
                        </button>
                      )}
                      <button
                        className={account.deleted_at ? "button" : "button danger"}
                        disabled={busy !== null}
                        aria-label={`${account.deleted_at ? "Restore" : "Move to trash"} account ${account.email}`}
                        onClick={() =>
                          void changeAccess(
                            account,
                            { trashed: !account.deleted_at },
                            view.trashDays,
                          )
                        }
                      >
                        {account.deleted_at ? "Restore" : "Trash"}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!shown && !loading && <p>No accounts match this filter.</p>}
      {loading && <p>Loading…</p>}
      {hasMore && !loading && (
        <button
          className="button users-more"
          onClick={() => void loadPage(filter.trim(), accountFilter, shown, true)}
        >
          Load more accounts
        </button>
      )}
    </>
  );
}
