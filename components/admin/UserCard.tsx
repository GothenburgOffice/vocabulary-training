"use client";
import { dailyLetters, type AiLimits } from "@/lib/ai-limits";
import {
  accountState,
  accountUsage,
  purgeDate,
  TRASH_DAYS,
  type AdminAccount,
} from "@/lib/admin/users";
import { limitState, UsageBreakdown, UsageStat } from "./UsageCell";

const KINDS = [
  { kind: "speech", label: "Speech" },
  { kind: "note", label: "Language notes" },
] as const;
const date = (value: string | Date) => new Date(value).toLocaleString();

export type AccessChange = { locked: boolean } | { trashed: boolean };

// One account in detail, opened from its row in the account list, with the changes an admin
// can make to it. Built from sections so more can join later (payments, sign-in providers, a
// fuller profile) without touching the list.
export default function UserCard({
  account,
  viewerId,
  limits,
  busy,
  onTier,
  onAccess,
}: {
  account: AdminAccount;
  viewerId: string;
  limits: AiLimits;
  busy: boolean;
  onTier: (tier: AdminAccount["ai_tier"]) => void;
  onAccess: (change: AccessChange) => void;
}) {
  const own = account.id === viewerId;
  return (
    <div className="detail-card">
      <section>
        <h3>Account</h3>
        <dl className="detail-facts">
          <dt>Role</dt>
          <dd>
            {account.is_admin ? "Admin" : "User"}
            {own && " (your account)"}
          </dd>
          <dt>Status</dt>
          <dd>
            {accountState(account)}
            {account.deleted_at ? (
              <small>
                In the trash since {date(account.deleted_at)}. Deleted for good with its data on{" "}
                {purgeDate(account.deleted_at).toLocaleDateString()} unless restored.
              </small>
            ) : account.locked_at ? (
              <small>Locked since {date(account.locked_at)}. It can’t sign in.</small>
            ) : null}
          </dd>
          <dt>Created</dt>
          <dd>{date(account.created_at)}</dd>
          <dt>Last sign-in</dt>
          <dd>{account.last_sign_in_at ? date(account.last_sign_in_at) : "Not recorded yet"}</dd>
          {account.write_limited_at && (
            <>
              <dt>Write limit</dt>
              <dd>
                Last went over it {date(account.write_limited_at)}
                <small>Faster than a person can save: likely a script (Admin → Limits).</small>
              </dd>
            </>
          )}
          <dt>
            <label htmlFor="user-card-tier">Account type</label>
          </dt>
          <dd>
            <select
              id="user-card-tier"
              value={account.ai_tier}
              disabled={busy}
              onChange={(event) => onTier(event.target.value as AdminAccount["ai_tier"])}
            >
              <option value="basic">Basic</option>
              <option value="plus">Plus</option>
            </select>
          </dd>
        </dl>
      </section>
      <section>
        <h3>AI usage</h3>
        <div className="user-usage">
          {KINDS.map(({ kind, label }) => {
            const usage = accountUsage(account, kind);
            const budget = dailyLetters(limits[kind], account.ai_tier);
            return (
              <div key={kind}>
                <h4>
                  {label}{" "}
                  <span className="usage-stat">
                    <UsageStat usage={usage} dailyBudget={budget} />
                  </span>
                </h4>
                <UsageBreakdown usage={usage} dailyBudget={budget} />
                <p className="field-help">{limitState(usage, budget)}</p>
              </div>
            );
          })}
        </div>
      </section>
      <section>
        <h3>Access</h3>
        {own ? (
          <p className="field-help">You can’t lock or trash your own account.</p>
        ) : (
          <>
            <p className="field-help">
              Locking ends its sessions at once and stops it signing in. The trash also locks it,
              and deletes it with its data after {TRASH_DAYS} days unless it is restored.
            </p>
            <div className="admin-actions">
              {!account.deleted_at && (
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => onAccess({ locked: !account.locked_at })}
                >
                  {account.locked_at ? "Unlock account" : "Lock account"}
                </button>
              )}
              <button
                className={account.deleted_at ? "button" : "button danger"}
                disabled={busy}
                onClick={() => onAccess({ trashed: !account.deleted_at })}
              >
                {account.deleted_at ? "Restore account" : "Move to trash"}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
