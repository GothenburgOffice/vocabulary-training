"use client";
import { useEffect, useMemo, useState } from "react";
import type { AiLimits } from "../../lib/ai-limits";
import { isE2eAccountEmail } from "../../lib/admin/users";
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
} & Record<`${UsageKind}_${"calls" | "letters"}_${UsagePeriod}`, number | string>;
type View = { viewerId: string; accounts: Account[]; limits: AiLimits };
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
const date = (value: string | null) => (value ? new Date(value).toLocaleString() : "Never");

export default function Users() {
  const [view, setView] = useState<View | null>(null);
  const [filter, setFilter] = useState("");
  const [accountFilter, setAccountFilter] = useState("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    adminRequest<View>("/api/admin/users")
      .then(setView)
      .catch((e: Error) => setError(e.message));
  }, []);

  const visible = useMemo(() => {
    if (!view) return [];
    const query = filter.trim().toLocaleLowerCase();
    return view.accounts.filter((account) => {
      if (accountFilter === "test" && !isE2eAccountEmail(account.email)) return false;
      if (accountFilter === "regular" && isE2eAccountEmail(account.email)) return false;
      return !query || account.email.toLocaleLowerCase().includes(query);
    });
  }, [accountFilter, filter, view]);

  if (!view) return error ? <p className="error">{error}</p> : <p>Loading accounts…</p>;

  const deletableTests = view.accounts.filter(
    (account) =>
      isE2eAccountEmail(account.email) && !account.is_admin && account.id !== view.viewerId,
  ).length;

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

  async function deleteAccount(account: Account) {
    if (!window.confirm(`Permanently delete ${account.email} and all of its data?`)) return;
    setBusy(account.id);
    setError("");
    setStatus("");
    try {
      await adminRequest("/api/admin/users", "DELETE", { userId: account.id });
      setView(
        (current) =>
          current && {
            ...current,
            accounts: current.accounts.filter((user) => user.id !== account.id),
          },
      );
      setStatus(`Deleted ${account.email}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function deleteTestAccounts() {
    if (
      !window.confirm(
        `Permanently delete ${deletableTests.toLocaleString("en")} E2E test accounts and all their data?`,
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
      setView(
        (current) =>
          current && {
            ...current,
            accounts: current.accounts.filter(
              (account) =>
                !isE2eAccountEmail(account.email) ||
                account.is_admin ||
                account.id === current.viewerId,
            ),
          },
      );
      setStatus(`Deleted ${result.deleted.toLocaleString("en")} E2E test accounts.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="users-toolbar">
        <label>
          Filter accounts
          <input value={filter} onChange={(event) => setFilter(event.target.value)} />
        </label>
        <label>
          Account filter
          <select value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)}>
            <option value="all">All accounts</option>
            <option value="regular">Non-test accounts</option>
            <option value="test">E2E test accounts</option>
          </select>
        </label>
        <button
          className="button danger"
          disabled={!deletableTests || busy !== null}
          onClick={() => void deleteTestAccounts()}
        >
          Delete test accounts ({deletableTests.toLocaleString("en")})
        </button>
      </div>
      <p className="field-help">
        Showing {visible.length.toLocaleString("en")} of {view.accounts.length.toLocaleString("en")}{" "}
        accounts. Usage counts provider calls and letters. Period budgets are the daily letter limit
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
        {visible.map((account) => (
          <article className="user-card" key={account.id}>
            <div className="user-summary">
              <div className="user-identity">
                <strong>{account.email}</strong>
                <span>{account.is_admin ? "Admin" : "User"}</span>
                <small>Created {date(account.created_at)}</small>
                <small>Last sign-in {date(account.last_sign_in_at)}</small>
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
              <button
                className="button danger"
                disabled={account.id === view.viewerId || busy !== null}
                aria-label={
                  account.id === view.viewerId
                    ? `Cannot delete your account ${account.email}`
                    : `Delete account ${account.email}`
                }
                onClick={() => void deleteAccount(account)}
                title={
                  account.id === view.viewerId ? "You cannot delete your own account." : undefined
                }
              >
                {account.id === view.viewerId ? "Your account" : "Delete"}
              </button>
            </div>
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
        {!visible.length && <p>No accounts match this filter.</p>}
      </div>
    </>
  );
}
