"use client";
import { useEffect, useState } from "react";
import {
  DEFAULT_MONITOR_NAME,
  type AiSettingsView,
  type MonitorCreated,
} from "../../lib/admin/ai-settings";
import type { UsageView } from "../../lib/admin/requesty-usage";
import { adminRequest } from "./request";

const SETUP = "docs/ai-features.md, “Requesty usage in the admin area”";

// The read-only Requesty management key and the label value that marks this app's keys.
export function MonitorCard({
  view,
  onSaved,
}: {
  view: AiSettingsView;
  onSaved: (view: AiSettingsView) => void;
}) {
  const current = view.monitor;
  const [apiKey, setApiKey] = useState("");
  const [appLabel, setAppLabel] = useState(current.appLabel);
  const [status, setStatus] = useState("");
  // Step one: an admin key (sent once, never stored) creates the read-only key in Requesty.
  const [adminKey, setAdminKey] = useState("");
  const [name, setName] = useState(DEFAULT_MONITOR_NAME);
  // Step two: the new key, shown only here and only until it's saved or the page is left.
  const [created, setCreated] = useState("");
  const [labelTiers, setLabelTiers] = useState(true);

  async function save(update: { apiKey?: string | null; appLabel?: string }) {
    setStatus(update.apiKey ? "Checking the key with Requesty…" : "Saving…");
    try {
      onSaved(await adminRequest<AiSettingsView>("/api/admin/ai/monitor", "PUT", update));
      if (update.apiKey !== undefined) setApiKey("");
      if (update.apiKey && update.apiKey === created) setCreated("");
      setStatus("Saved.");
    } catch (e) {
      setStatus((e as Error).message);
    }
  }
  async function create() {
    setStatus("Creating the key in Requesty…");
    try {
      const result = await adminRequest<MonitorCreated>("/api/admin/ai/monitor/create", "POST", {
        adminKey,
        name,
        labelTiers,
      });
      setAdminKey("");
      setCreated(result.apiKey);
      const labelled = result.labelled.map((k) => (k.name ? `${k.tier} (${k.name})` : k.tier));
      setStatus(
        [
          "Created. Copy the new key now: Requesty won't show it again.",
          labelled.length ? `Labelled app=${current.appLabel}: ${labelled.join(", ")}.` : "",
          ...result.problems,
        ]
          .filter(Boolean)
          .join(" "),
      );
    } catch (e) {
      setStatus((e as Error).message);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(created);
      setStatus("Copied.");
    } catch {
      setStatus("Copying isn't allowed here. Select the key and copy it.");
    }
  }
  const keyText =
    current.key.state === "set"
      ? `Saved, ending in …${current.key.hint}`
      : current.key.state === "unreadable"
        ? "Saved, but it can't be decrypted with the current SETTINGS_ENCRYPTION_KEY. Enter it again."
        : "Not set: usage isn't shown.";

  return (
    <section className="admin-card">
      <h2>Requesty monitor key</h2>
      <p className="field-help">
        A separate, read-only management key (manage: read, completions: none) shows the balance and
        this app&apos;s spend here. It can&apos;t make model calls or change anything in Requesty.
        Setup: {SETUP}.
      </p>
      <h3>Create a read-only key</h3>
      <label className="field">
        Requesty admin key
        <input
          type="password"
          autoComplete="off"
          value={adminKey}
          placeholder="A temporary key with full rights"
          onChange={(e) => setAdminKey(e.target.value)}
        />
        <small>Used once to create the key, never saved. Delete it in Requesty afterwards.</small>
      </label>
      <label className="field">
        Name for the new key
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="admin-check">
        <input
          type="checkbox"
          checked={labelTiers}
          onChange={(e) => setLabelTiers(e.target.checked)}
        />
        Also label the saved basic and plus keys app={current.appLabel}, tier=basic or plus, so
        usage counts only this app (their other labels are kept)
      </label>
      <div className="admin-actions">
        <button
          className="button primary"
          disabled={!adminKey.trim() || !name.trim()}
          onClick={() => void create()}
        >
          Create read-only key
        </button>
      </div>
      {created && (
        <div className="monitor-created">
          <label className="field">
            New read-only key
            <input readOnly value={created} onFocus={(e) => e.target.select()} />
            <small>
              Shown only this once. Copy it to your password manager, then save it here.
            </small>
          </label>
          <div className="admin-actions">
            <button className="button" onClick={() => void copy()}>
              Copy
            </button>
            <button className="button primary" onClick={() => void save({ apiKey: created })}>
              Save this key
            </button>
          </div>
        </div>
      )}
      <h3>Monitor key</h3>
      <label className="field">
        Monitor key
        <input
          type="password"
          autoComplete="off"
          value={apiKey}
          placeholder={
            current.key.state === "set" ? "Enter a new key to replace it" : "Or paste a monitor key"
          }
          onChange={(e) => setApiKey(e.target.value)}
        />
        <small>{keyText}</small>
      </label>
      <div className="admin-actions">
        <button
          className="button primary"
          disabled={!apiKey.trim()}
          onClick={() => void save({ apiKey })}
        >
          Save key
        </button>
        {current.key.state !== "unset" && (
          <button className="button" onClick={() => void save({ apiKey: null })}>
            Remove key
          </button>
        )}
      </div>
      <label className="field">
        App label
        <input value={appLabel} onChange={(e) => setAppLabel(e.target.value)} />
        <small>Usage counts only keys labelled app=this value in Requesty.</small>
      </label>
      <div className="admin-actions">
        <button className="button primary" onClick={() => void save({ appLabel: appLabel.trim() })}>
          Save label
        </button>
      </div>
      {status && (
        <p className="admin-status" role="status">
          {status}
        </p>
      )}
    </section>
  );
}

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const usd = (n: number) => money.format(n);
const number = (n: number) => n.toLocaleString("en-US");
function month(period: string) {
  const date = new Date(period);
  return Number.isNaN(date.getTime())
    ? period
    : date.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}
const dateTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-GB");
};

// Shown once a monitor key is saved. Remount it (key) to read again after a save.
export function UsagePanel() {
  const [usage, setUsage] = useState<UsageView | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    adminRequest<UsageView>("/api/admin/ai/usage")
      .then(setUsage)
      .catch((e: Error) => setError(e.message));
  }, []);
  if (error) return <p className="error">{error}</p>;
  if (!usage) return <p>Loading Requesty usage…</p>;
  if (!usage.configured) return null;
  const label = `app=${usage.appLabel}`;
  const lastUsed = usage.keys.some((k) => k.lastUsedAt);
  return (
    <section className="requesty-usage" aria-label="Requesty usage">
      <h2>Requesty usage</h2>
      <p>
        Organisation balance:{" "}
        <strong>{usage.org.balance === null ? "unknown" : usd(usage.org.balance)}</strong>
        {usage.org.name && ` (${usage.org.name}, shared by every key in it)`}. Read{" "}
        {dateTime(usage.fetchedAt)}; Requesty is asked at most once a minute.
      </p>
      <h3>Keys labelled {label}</h3>
      {usage.keys.length === 0 ? (
        <p className="field-help">
          No Requesty key carries the label {label}. Label the tier keys as described in {SETUP}.
        </p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Tier</th>
                <th>Key</th>
                <th>Spent this month</th>
                <th>Monthly limit</th>
                {lastUsed && <th>Last used</th>}
              </tr>
            </thead>
            <tbody>
              {usage.keys.map((k, i) => (
                <tr key={i}>
                  <td>{k.tier || "No tier label"}</td>
                  <td>{k.name}</td>
                  <td>{usd(k.monthlySpend)}</td>
                  <td>{k.monthlyLimit === null ? "No limit" : usd(k.monthlyLimit)}</td>
                  {lastUsed && <td>{k.lastUsedAt ? dateTime(k.lastUsedAt) : "Never"}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h3>Usage this month and last month</h3>
      {usage.usage.length === 0 ? (
        <p className="field-help">
          No usage by keys labelled {label} in this period. Requests made before the keys were
          labelled count as &ldquo;Unknown&rdquo; in Requesty and aren&apos;t shown.
        </p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Tier</th>
                <th>Requests</th>
                <th>Input tokens</th>
                <th>Output tokens</th>
                <th>Spend</th>
              </tr>
            </thead>
            <tbody>
              {usage.usage.map((row) => (
                <tr key={`${row.period}:${row.tier}`}>
                  <td>{month(row.period)}</td>
                  <td>{row.tier}</td>
                  <td>{number(row.requests)}</td>
                  <td>{number(row.inputTokens)}</td>
                  <td>{number(row.outputTokens)}</td>
                  <td>{usd(row.spend)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
