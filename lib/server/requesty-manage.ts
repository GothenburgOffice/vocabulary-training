// Requesty's Management API (#121): balance, this app's keys and its usage, for Admin → AI
// settings. Imported only by server routes; the transport is a parameter so unit tests never
// call Requesty. The stored monitor key is read-only, checked when it's saved
// (checkMonitorKey). The one write is createMonitorKey: it makes that read-only key with an
// admin key the admin types in, which is used for that one request and never stored.
import type { Tier } from "../admin/ai-settings";
import {
  describePermissions,
  isReadOnlyMonitorKey,
  parseAppKeys,
  parseAppUsage,
  parseOrg,
  rfc3339,
  usageStart,
  type UsageView,
} from "../admin/requesty-usage";
import { HttpError } from "./http";
import { readRequestyJSON } from "./requesty-client";

const base = "https://api-v2.requesty.ai/v1/manage";
type Fetcher = typeof fetch;
// A 502 for the admin page; refused marks a 401 or 403, so a key check can say so.
class ManageError extends HttpError {
  constructor(
    message: string,
    public refused = false,
  ) {
    super(502, message);
  }
}

async function get(
  apiKey: string,
  path: string,
  transport: Fetcher,
  post?: unknown,
  // false for a write whose answer isn't read: any success is enough.
  needBody = true,
): Promise<unknown> {
  let response: Response;
  try {
    response = await transport(`${base}${path}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(post === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(post === undefined ? {} : { method: "POST", body: JSON.stringify(post) }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
      redirect: "error",
    });
  } catch {
    throw new ManageError("Requesty didn't answer. Try again in a moment.");
  }
  if (response.status === 401 || response.status === 403) {
    await response.body?.cancel();
    throw new ManageError("Requesty refused the monitor key. Check it in Requesty.", true);
  }
  if (!needBody && response.ok) {
    await response.body?.cancel();
    return null;
  }
  try {
    return await readRequestyJSON(response, 2_000_000);
  } catch {
    throw new ManageError("Requesty didn't return usage data. Try again in a moment.");
  }
}

// Before a monitor key is stored: Requesty must report it as manage "read", completions
// "none", so a full-rights or model-call key can't be saved by mistake.
export async function checkMonitorKey(apiKey: string, transport: Fetcher = fetch) {
  let self: unknown;
  try {
    self = await get(apiKey, "/apikey/self", transport);
  } catch (e) {
    if (e instanceof ManageError && e.refused)
      throw new HttpError(400, "Requesty didn't accept this key.");
    throw e;
  }
  if (!isReadOnlyMonitorKey(self))
    throw new HttpError(
      400,
      `This key has ${describePermissions(self)}. Use a key created with manage: read and ` +
        "completions: none (see docs/ai-features.md).",
    );
}

// Creates the read-only monitor key with an admin key (manage: write). Only the new key's
// secret is returned, for the admin to see once and then save; the admin key isn't kept.
export async function createMonitorKey(
  adminKey: string,
  name: string,
  transport: Fetcher = fetch,
): Promise<string> {
  let created: unknown;
  try {
    created = await get(adminKey, "/apikey", transport, {
      name,
      permissions: { manage: "read", completions: "none" },
    });
  } catch (e) {
    if (e instanceof ManageError && e.refused)
      throw new HttpError(
        400,
        "Requesty didn't accept the admin key. Use a key with full rights (manage: write).",
      );
    throw e;
  }
  const apiKey = (created as { api_key?: unknown } | null)?.api_key;
  if (typeof apiKey !== "string" || !apiKey)
    throw new HttpError(502, "Requesty didn't return the new key. Check its key list.");
  return apiKey;
}

// Labels the tier keys app=<appLabel>, tier=<tier> with the admin key, so usage can be told
// apart from other apps' keys in the organisation. Each saved tier key tells Requesty its
// own id (GET /apikey/self works with any key); its other labels are kept, since setting
// labels replaces them all. Returns what was labelled and what wasn't, never throwing for one
// tier, so a key created just before isn't lost.
export type LabelResult = { labelled: { tier: Tier; name: string }[]; problems: string[] };
export async function labelTierKeys(
  adminKey: string,
  tierKeys: Record<Tier, string>,
  appLabel: string,
  transport: Fetcher = fetch,
): Promise<LabelResult> {
  const result: LabelResult = { labelled: [], problems: [] };
  let list: { id?: unknown; name?: unknown; labels?: unknown }[];
  try {
    const keys = ((await get(adminKey, "/apikey", transport)) as { keys?: unknown } | null)?.keys;
    list = Array.isArray(keys) ? keys : [];
  } catch (e) {
    result.problems.push(`The tier keys weren't labelled: ${(e as Error).message}`);
    return result;
  }
  const done = new Map<string, Tier>();
  for (const tier of ["basic", "plus"] as const) {
    const key = tierKeys[tier];
    if (!key) {
      if (tier === "basic") result.problems.push("No basic key is saved, so none was labelled.");
      continue;
    }
    try {
      const self = (await get(key, "/apikey/self", transport)) as { id?: unknown } | null;
      const id = typeof self?.id === "string" ? self.id : "";
      if (!/^[A-Za-z0-9-]{1,100}$/.test(id))
        throw new Error("Requesty didn't say which key it is.");
      const other = done.get(id);
      if (other) {
        result.problems.push(
          `The ${tier} key is the same Requesty key as ${other}; left as ${other}.`,
        );
        continue;
      }
      const entry = list.find((k) => k.id === id);
      // Requesty's docs list labels with each key but don't require them, and a listing without
      // them has been seen. Setting labels replaces them all, so when they're missing the key
      // is still labelled, and the admin is told any other labels may be gone.
      const listed = !!entry?.labels && typeof entry.labels === "object";
      const existing = listed ? (entry!.labels as Record<string, string>) : {};
      await get(
        adminKey,
        `/apikey/${id}/label`,
        transport,
        { labels: { ...existing, app: appLabel, tier } },
        false,
      );
      done.set(id, tier);
      result.labelled.push({ tier, name: typeof entry?.name === "string" ? entry.name : "" });
      if (!listed)
        result.problems.push(
          `Requesty didn't list the ${tier} key's labels, so any other labels it had were ` +
            "replaced. Check it in Requesty.",
        );
    } catch (e) {
      const reason =
        e instanceof ManageError && e.refused
          ? "Requesty refused the request."
          : (e as Error).message;
      result.problems.push(`The ${tier} key wasn't labelled: ${reason}`);
    }
  }
  return result;
}

export async function readUsage(
  apiKey: string,
  appLabel: string,
  now = new Date(),
  transport: Fetcher = fetch,
): Promise<UsageView> {
  const query = new URLSearchParams({
    start: rfc3339(usageStart(now)),
    end: rfc3339(now),
    resolution: "month",
  });
  query.append("group_by", "api_key_label.app");
  query.append("group_by", "api_key_label.tier");
  const [org, keys, usage] = await Promise.all([
    get(apiKey, "/org", transport),
    get(apiKey, "/apikey", transport),
    get(apiKey, `/org/usage?${query}`, transport),
  ]);
  return {
    configured: true,
    appLabel,
    org: parseOrg(org),
    keys: parseAppKeys(keys, appLabel),
    usage: parseAppUsage(usage, appLabel),
    fetchedAt: now.toISOString(),
  };
}

// The admin page reads this on every visit; Requesty is asked at most once a minute per key
// and label. Nothing is kept beyond that: Requesty holds the history.
const CACHE_MS = 60_000;
let cache: { id: string; at: number; value: Promise<UsageView> } | null = null;
export function cachedUsage(apiKey: string, appLabel: string) {
  const id = `${apiKey}\n${appLabel}`;
  if (cache && cache.id === id && Date.now() - cache.at < CACHE_MS) return cache.value;
  const value = readUsage(apiKey, appLabel);
  const entry = { id, at: Date.now(), value };
  cache = entry;
  value.catch(() => {
    if (cache === entry) cache = null;
  });
  return value;
}
export function invalidateUsage() {
  cache = null;
}
