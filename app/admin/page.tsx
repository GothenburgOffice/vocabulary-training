import Link from "next/link";
import { ADMIN_SECTIONS } from "../../lib/admin/sections";
import { usageTotals } from "../../lib/server/ai-limits";
import { adminPage } from "../../lib/server/auth";
import { db } from "../../lib/server/db";

export default async function AdminOverview() {
  await adminPage();
  const { rows } = await db.query(
    "SELECT count(*)::int AS accounts, count(*) FILTER (WHERE is_admin)::int AS admins FROM users",
  );
  const usage = await usageTotals();
  const sections = ADMIN_SECTIONS.filter((section) => section.href !== "/admin");
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>Overview</h1>
          <p>Accounts and AI usage on this server.</p>
        </div>
      </header>
      <div className="admin-stats">
        <div>
          <span>Accounts</span>
          <strong>{rows[0].accounts}</strong>
        </div>
        <div>
          <span>Admins</span>
          <strong>{rows[0].admins}</strong>
        </div>
      </div>
      <h2 className="admin-subheading">AI usage, all accounts</h2>
      <table className="admin-usage">
        <thead>
          <tr>
            <th scope="col">Feature</th>
            <th scope="col">Last 24 hours</th>
            <th scope="col">Last 7 days</th>
            <th scope="col">Last 90 days</th>
          </tr>
        </thead>
        <tbody>
          {(["speech", "note"] as const).map((kind) => {
            const row = usage.find((u) => u.kind === kind);
            const cell = (calls = 0, letters = 0, accounts = 0) =>
              `${calls.toLocaleString("en")} ${kind === "speech" ? "clips" : "notes"} · ${letters.toLocaleString("en")} letters · ${accounts.toLocaleString("en")} ${accounts === 1 ? "account" : "accounts"}`;
            return (
              <tr key={kind}>
                <th scope="row">{kind === "speech" ? "Speech" : "Language notes"}</th>
                <td>{cell(row?.calls_day, row?.letters_day, row?.accounts_day)}</td>
                <td>{cell(row?.calls_week, row?.letters_week, row?.accounts_week)}</td>
                <td>{cell(row?.calls_90, row?.letters_90, row?.accounts_90)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="field-help">
        Counts calls that reached the AI provider; cached audio replays are free. The limits per
        account (letters per minute and per day) are the <code>limits.*</code> site settings in the
        database.
      </p>
      {sections.length > 0 && (
        <ul className="admin-sections">
          {sections.map((section) => (
            <li key={section.href}>
              <Link href={section.href}>
                <strong>{section.title}</strong>
                <span>{section.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
