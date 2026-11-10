// Requesty spend and budgets for Admin → AI settings (#121): the shapes the usage route sends
// the browser, and pure parsers for the Management API's responses. Only aggregate numbers
// about the operator's own Requesty organisation; nothing about learners.

// manage and completions are each "none", "read" or "write". The app only holds a key that
// can read and can't spend: manage "read", completions "none".
export function isReadOnlyMonitorKey(data: unknown) {
  const p = (data as { permissions?: { manage?: unknown; completions?: unknown } } | null)
    ?.permissions;
  return p?.manage === "read" && p?.completions === "none";
}
export function describePermissions(data: unknown) {
  const p = (data as { permissions?: { manage?: unknown; completions?: unknown } } | null)
    ?.permissions;
  const text = (v: unknown) => (typeof v === "string" ? v : "unknown");
  return `manage: ${text(p?.manage)}, completions: ${text(p?.completions)}`;
}

// Requesty sends decimals as numbers, and has been seen sending them as strings ("0").
function amount(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}
const count = (value: unknown) => amount(value) ?? 0;
const text = (value: unknown) => (typeof value === "string" ? value : "");

export type OrgInfo = { name: string; balance: number | null };
export function parseOrg(data: unknown): OrgInfo {
  const org = (data ?? {}) as { name?: unknown; balance?: unknown };
  return { name: text(org.name), balance: amount(org.balance) };
}

export type RequestyKey = {
  name: string;
  tier: string;
  monthlySpend: number;
  // null: no limit (Requesty's "0").
  monthlyLimit: number | null;
  // Not in Requesty's documented schema; shown when a response carries it.
  lastUsedAt: string | null;
};
const TIER_ORDER = ["basic", "plus"];
// The keys labelled app=<appLabel>, by tier. Other apps' keys, unlabelled ones included,
// are left out.
export function parseAppKeys(data: unknown, appLabel: string): RequestyKey[] {
  const keys = (data as { keys?: unknown } | null)?.keys;
  if (!Array.isArray(keys)) return [];
  return keys
    .filter((k) => k?.labels && typeof k.labels === "object" && k.labels.app === appLabel)
    .map((k) => {
      const limit = amount(k.monthly_limit);
      return {
        name: text(k.name),
        tier: text(k.labels.tier),
        monthlySpend: count(k.monthly_spend),
        monthlyLimit: limit ? limit : null,
        lastUsedAt: text(k.last_used_at) || null,
      };
    })
    .sort((a, b) => tierRank(a.tier) - tierRank(b.tier) || a.name.localeCompare(b.name));
}
function tierRank(tier: string) {
  const i = TIER_ORDER.indexOf(tier);
  return i === -1 ? TIER_ORDER.length : i;
}

export type UsageRow = {
  // The period as Requesty names it (the start of a month for resolution=month).
  period: string;
  tier: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  spend: number;
};
// A grouped value: Requesty's docs don't say whether the key in group_by_values is the full
// group_by name or only the label key, so both are read.
function groupValue(values: Record<string, unknown>, label: string) {
  const value = values[`api_key_label.${label}`] ?? values[label];
  return typeof value === "string" ? value : "";
}
// Organisation usage grouped by api_key_label.app and api_key_label.tier, filtered to this
// app's rows. The API groups but can't filter, so other apps' rows and "Unknown" (keys
// without the label) are dropped here.
export function parseAppUsage(data: unknown, appLabel: string): UsageRow[] {
  const usage = (data as { usage?: unknown } | null)?.usage;
  if (!usage || typeof usage !== "object") return [];
  const rows: UsageRow[] = [];
  for (const [period, entry] of Object.entries(usage as Record<string, unknown>)) {
    const groups = (entry as { grouped_data?: unknown } | null)?.grouped_data;
    if (!Array.isArray(groups)) continue;
    for (const group of groups) {
      const values = group?.group_by_values;
      if (!values || typeof values !== "object") continue;
      if (groupValue(values, "app") !== appLabel) continue;
      rows.push({
        period,
        tier: groupValue(values, "tier") || "Unknown",
        requests: count(group.total_requests),
        inputTokens: count(group.input_tokens),
        outputTokens: count(group.output_tokens),
        spend: count(group.spend),
      });
    }
  }
  return rows.sort(
    (a, b) => b.period.localeCompare(a.period) || tierRank(a.tier) - tierRank(b.tier),
  );
}

// What GET /api/admin/ai/usage returns.
export type UsageView =
  | { configured: false }
  | {
      configured: true;
      appLabel: string;
      org: OrgInfo;
      keys: RequestyKey[];
      // This month and last month, newest first.
      usage: UsageRow[];
      fetchedAt: string;
    };

// The first day of last month (UTC): the usage window, at most 62 days, under Requesty's 100.
export function usageStart(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
}
// RFC 3339 without milliseconds, as Requesty's examples write it.
export const rfc3339 = (date: Date) => date.toISOString().replace(/\.\d{3}Z$/, "Z");
