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
const PERIODS: { name: UsagePeriod; label: string; days: number }[] = [
  { name: "day", label: "24 hours", days: 1 },
  { name: "week", label: "7 days", days: 7 },
  { name: "90", label: "90 days", days: 90 },
];
const KINDS: { kind: UsageKind; label: string }[] = [
  { kind: "speech", label: "Speech" },
  { kind: "note", label: "Language notes" },
];
const number = (value: number | string) => Number(value).toLocaleString("en");
const date = (value: string) => new Date(value).toLocaleString();

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
        Usage counts provider calls and letters. Period budgets are the daily letter limit
        multiplied by the number of days; 0 means unlimited.
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
      <div className="users-list">
        {view.accounts.map((account) => (
          <article className="user-card" key={account.id}>
            <div className="user-summary">
              <div className="user-identity">
                <strong>{account.email}</strong>
                <span>{account.is_admin ? "Admin" : "User"}</span>
                <small>Created {date(account.created_at)}</small>
                <small>
                  Last sign-in{" "}
                  {account.last_sign_in_at ? date(account.last_sign_in_at) : "not recorded yet"}
                </small>
              </div>
              <label>
                Account type
                <select
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
              </label>
              {account.id === view.viewerId ? (
                <span className="admin-status">Your account</span>
              ) : (
                <div className="admin-actions">
                  {!account.deleted_at && (
                    <button
                      className="button"
                      disabled={busy !== null}
                      aria-label={`${account.locked_at ? "Unlock" : "Lock"} account ${account.email}`}
                      onClick={() =>
                        void changeAccess(account, { locked: !account.locked_at }, view.trashDays)
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
                      void changeAccess(account, { trashed: !account.deleted_at }, view.trashDays)
                    }
                  >
                    {account.deleted_at ? "Restore" : "Move to trash"}
                  </button>
                </div>
              )}
            </div>
            {account.deleted_at ? (
              <p className="user-access" role="note">
                In the trash since {date(account.deleted_at)}. Deleted for good on{" "}
                {purgeDate(account.deleted_at).toLocaleDateString()}.
              </p>
            ) : account.locked_at ? (
              <p className="user-access" role="note">
                Locked since {date(account.locked_at)}. It can’t sign in.
              </p>
            ) : null}
            <details className="user-usage">
              <summary>AI usage</summary>
              <div className="user-usage-scroll">
                <table className="admin-usage">
                  <thead>
                    <tr>
                      <th scope="col">Feature</th>
                      {PERIODS.map((period) => (
                        <th key={period.name} scope="col">
                          Last {period.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {KINDS.map(({ kind, label }) => (
                      <tr key={kind}>
                        <th scope="row">
                          {label}
                          <small>
                            Daily budget: {number(view.limits[kind].lettersPerDay[account.ai_tier])}{" "}
                            letters ({account.ai_tier})
                          </small>
                        </th>
                        {PERIODS.map((period) => {
                          const calls = account[`${kind}_calls_${period.name}`];
                          const letters = account[`${kind}_letters_${period.name}`];
                          const dailyBudget = view.limits[kind].lettersPerDay[account.ai_tier];
                          const budget = dailyBudget * period.days;
                          return (
                            <td key={period.name}>
                              {number(calls)} calls · {number(letters)} /{" "}
                              {budget ? number(budget) : "unlimited"} letters
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </article>
        ))}
        {!shown && !loading && <p>No accounts match this filter.</p>}
        {loading && <p>Loading…</p>}
        {hasMore && !loading && (
          <button
            className="button"
            onClick={() => void loadPage(filter.trim(), accountFilter, shown, true)}
          >
            Load more accounts
          </button>
        )}
      </div>
    </>
  );
}
