import assert from "node:assert/strict";
import { test } from "node:test";
import { monitorCreateSchema, monitorUpdateSchema } from "../lib/admin/ai-settings.ts";
import {
  isReadOnlyMonitorKey,
  parseAppKeys,
  parseAppUsage,
  parseOrg,
  rfc3339,
  usageStart,
} from "../lib/admin/requesty-usage.ts";
import {
  checkMonitorKey,
  createMonitorKey,
  labelTierKeys,
  readUsage,
} from "../lib/server/requesty-manage.ts";

// Fake Requesty: answers by path, records each request. Tests never call Requesty.
function fakeRequesty(routes: Record<string, { status?: number; body: unknown }>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const transport = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const path = new URL(String(url)).pathname.replace("/v1/manage", "");
    const route = routes[path];
    if (!route) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify(route.body), { status: route.status ?? 200 });
  }) as typeof fetch;
  return { transport, calls };
}
const permissions = (manage: string, completions: string) => ({
  body: { id: "k", name: "monitor", permissions: { manage, completions } },
});

test("only a manage: read, completions: none key counts as a monitor key", () => {
  assert.equal(
    isReadOnlyMonitorKey({ permissions: { manage: "read", completions: "none" } }),
    true,
  );
  for (const [manage, completions] of [
    ["write", "none"],
    ["read", "read"],
    ["read", "write"],
    ["none", "none"],
    ["write", "write"],
  ])
    assert.equal(isReadOnlyMonitorKey({ permissions: { manage, completions } }), false);
  for (const junk of [null, {}, { permissions: null }, "read"])
    assert.equal(isReadOnlyMonitorKey(junk), false);
});

test("saving a monitor key checks its permissions with Requesty first", async () => {
  const ok = fakeRequesty({ "/apikey/self": permissions("read", "none") });
  await checkMonitorKey("rqsty-sk-dummy", ok.transport);
  assert.equal(ok.calls.length, 1);
  assert.equal(ok.calls[0].url, "https://api-v2.requesty.ai/v1/manage/apikey/self");
  assert.equal(
    new Headers(ok.calls[0].init?.headers).get("authorization"),
    "Bearer rqsty-sk-dummy",
  );
  assert.equal(ok.calls[0].init?.method ?? "GET", "GET");

  const full = fakeRequesty({ "/apikey/self": permissions("write", "write") });
  await assert.rejects(checkMonitorKey("rqsty-sk-dummy", full.transport), {
    status: 400,
    message: /manage: write, completions: write/,
  });
  const modelKey = fakeRequesty({ "/apikey/self": permissions("none", "write") });
  await assert.rejects(checkMonitorKey("rqsty-sk-dummy", modelKey.transport), { status: 400 });
  const refused = fakeRequesty({ "/apikey/self": { status: 401, body: {} } });
  await assert.rejects(checkMonitorKey("rqsty-sk-dummy", refused.transport), {
    status: 400,
    message: "Requesty didn't accept this key.",
  });
  const down = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;
  await assert.rejects(checkMonitorKey("rqsty-sk-dummy", down), { status: 502 });
});

test("the monitor label is a plain label value", () => {
  assert.equal(monitorUpdateSchema.safeParse({ appLabel: "vocabulary-training" }).success, true);
  assert.equal(monitorUpdateSchema.safeParse({ apiKey: null }).success, true);
  for (const appLabel of ["", "two words", "a&b=c", "x".repeat(101)])
    assert.equal(monitorUpdateSchema.safeParse({ appLabel }).success, false, appLabel);
  assert.equal(monitorUpdateSchema.safeParse({ tier: "basic" }).success, false);
});

test("the balance and key amounts parse from numbers or strings, and 0 means no limit", () => {
  assert.deepEqual(parseOrg({ name: "Org", balance: 12.5 }), { name: "Org", balance: 12.5 });
  assert.deepEqual(parseOrg({ name: "Org", balance: "3.25" }), { name: "Org", balance: 3.25 });
  assert.deepEqual(parseOrg(null), { name: "", balance: null });

  const keys = parseAppKeys(
    {
      keys: [
        {
          name: "Vocabulary plus",
          monthly_limit: 20,
          monthly_spend: "1.5",
          labels: { app: "vocabulary-training", tier: "plus" },
        },
        {
          name: "Vocabulary basic",
          monthly_limit: "0",
          monthly_spend: 0.25,
          last_used_at: "2026-11-05T10:00:00Z",
          labels: { app: "vocabulary-training", tier: "basic" },
        },
        { name: "Other app", monthly_limit: 5, monthly_spend: 4, labels: { app: "moneyworks" } },
        { name: "Unlabelled", monthly_limit: 0, monthly_spend: 9 },
        { name: "Monitor", monthly_limit: 0, monthly_spend: 0, labels: {} },
      ],
    },
    "vocabulary-training",
  );
  assert.deepEqual(keys, [
    {
      name: "Vocabulary basic",
      tier: "basic",
      monthlySpend: 0.25,
      monthlyLimit: null,
      lastUsedAt: "2026-11-05T10:00:00Z",
    },
    {
      name: "Vocabulary plus",
      tier: "plus",
      monthlySpend: 1.5,
      monthlyLimit: 20,
      lastUsedAt: null,
    },
  ]);
  assert.deepEqual(parseAppKeys({}, "vocabulary-training"), []);
});

test("grouped usage keeps only this app's label value, dropping other apps and Unknown", () => {
  const group = (values: Record<string, string>, spend: number) => ({
    group_by_values: values,
    total_requests: 10,
    input_tokens: 100,
    output_tokens: "50",
    spend,
  });
  const rows = parseAppUsage(
    {
      usage: {
        "2026-10-01T00:00:00Z": {
          total_requests: 99,
          spend: 9,
          grouped_data: [
            group({ "api_key_label.app": "vocabulary-training", "api_key_label.tier": "plus" }, 2),
            group({ "api_key_label.app": "vocabulary-training", "api_key_label.tier": "basic" }, 1),
            group({ "api_key_label.app": "moneyworks", "api_key_label.tier": "basic" }, 5),
            group({ "api_key_label.app": "Unknown", "api_key_label.tier": "Unknown" }, 1),
          ],
        },
        // The docs don't say how group_by_values is keyed, so the bare label key works too.
        "2026-11-01T00:00:00Z": {
          grouped_data: [group({ app: "vocabulary-training", tier: "basic" }, 0.5)],
        },
        "2026-09-01T00:00:00Z": { total_requests: 3 },
      },
    },
    "vocabulary-training",
  );
  assert.deepEqual(
    rows.map((r) => [r.period, r.tier, r.spend]),
    [
      ["2026-11-01T00:00:00Z", "basic", 0.5],
      ["2026-10-01T00:00:00Z", "basic", 1],
      ["2026-10-01T00:00:00Z", "plus", 2],
    ],
  );
  assert.deepEqual(rows[0], {
    period: "2026-11-01T00:00:00Z",
    tier: "basic",
    requests: 10,
    inputTokens: 100,
    outputTokens: 50,
    spend: 0.5,
  });
  assert.deepEqual(parseAppUsage({ usage: null }, "vocabulary-training"), []);
});

test("usage covers last month and this month, grouped by the app and tier labels", async () => {
  const now = new Date("2026-01-15T12:34:56.789Z");
  assert.equal(rfc3339(usageStart(now)), "2025-12-01T00:00:00Z");
  const { transport, calls } = fakeRequesty({
    "/org": { body: { name: "Org", balance: 40 } },
    "/apikey": { body: { keys: [] } },
    "/org/usage": { body: { usage: {} } },
  });
  const view = await readUsage("rqsty-sk-dummy", "vocabulary-training", now, transport);
  assert.deepEqual(view, {
    configured: true,
    appLabel: "vocabulary-training",
    org: { name: "Org", balance: 40 },
    keys: [],
    usage: [],
    fetchedAt: "2026-01-15T12:34:56.789Z",
  });
  const usage = new URL(calls.find((c) => c.url.includes("/org/usage"))!.url);
  assert.equal(usage.searchParams.get("start"), "2025-12-01T00:00:00Z");
  assert.equal(usage.searchParams.get("end"), "2026-01-15T12:34:56Z");
  assert.equal(usage.searchParams.get("resolution"), "month");
  assert.deepEqual(usage.searchParams.getAll("group_by"), [
    "api_key_label.app",
    "api_key_label.tier",
  ]);
  assert(calls.every((c) => (c.init?.method ?? "GET") === "GET"));

  const refused = fakeRequesty({ "/org": { status: 403, body: {} } });
  await assert.rejects(readUsage("rqsty-sk-dummy", "x", now, refused.transport), {
    status: 502,
    message: /refused the monitor key/,
  });
});

test("creating the monitor key asks for read-only rights and returns only the new key", async () => {
  const { transport, calls } = fakeRequesty({
    "/apikey": { body: { api_key_id: "id-1", api_key: "rqsty-sk-new-monitor" } },
  });
  assert.equal(
    await createMonitorKey("rqsty-sk-admin-dummy", "Vocabulary admin monitor", transport),
    "rqsty-sk-new-monitor",
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api-v2.requesty.ai/v1/manage/apikey");
  assert.equal(calls[0].init?.method, "POST");
  const headers = new Headers(calls[0].init?.headers);
  assert.equal(headers.get("authorization"), "Bearer rqsty-sk-admin-dummy");
  assert.equal(headers.get("content-type"), "application/json");
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
    name: "Vocabulary admin monitor",
    permissions: { manage: "read", completions: "none" },
  });

  const refused = fakeRequesty({ "/apikey": { status: 403, body: {} } });
  await assert.rejects(createMonitorKey("rqsty-sk-read-only", "x", refused.transport), {
    status: 400,
    message: /admin key/,
  });
  const empty = fakeRequesty({ "/apikey": { body: { api_key_id: "id-1" } } });
  await assert.rejects(createMonitorKey("rqsty-sk-admin-dummy", "x", empty.transport), {
    status: 502,
  });
});

test("creating a monitor key needs an admin key and a name", () => {
  const ok = { adminKey: "rqsty-sk-admin", name: "Vocabulary admin monitor" };
  assert.equal(monitorCreateSchema.safeParse(ok).success, true);
  for (const bad of [
    { ...ok, adminKey: " " },
    { ...ok, name: "" },
    { ...ok, name: "a\u0007b" },
    { ...ok, name: "x".repeat(101) },
    { ...ok, permissions: { manage: "write" } },
  ])
    assert.equal(monitorCreateSchema.safeParse(bad).success, false, JSON.stringify(bad));
});

// Fake Requesty for labelling: /apikey/self answers with the id of the key that asks.
function fakeOrg(ids: Record<string, string>, refuse: string[] = []) {
  const labels: Record<string, unknown>[] = [];
  const calls: { url: string; auth: string; method: string }[] = [];
  const transport = (async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname.replace("/v1/manage", "");
    const auth = new Headers(init?.headers).get("authorization")!.replace("Bearer ", "");
    calls.push({ url: path, auth, method: init?.method ?? "GET" });
    if (refuse.includes(auth)) return new Response("{}", { status: 401 });
    if (path === "/apikey/self") return Response.json({ id: ids[auth] });
    if (path === "/apikey")
      return Response.json({
        keys: [
          { id: "id-basic", name: "Vocab basic", labels: { team: "lang" } },
          { id: "id-plus", name: "Vocab plus" },
        ],
      });
    const label = path.match(/^\/apikey\/([^/]+)\/label$/);
    if (label && init?.method === "POST") {
      labels.push({ id: label[1], ...JSON.parse(String(init.body)) });
      return new Response(null, { status: 204 });
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  return { transport, labels, calls };
}
const ids = { "rqsty-sk-basic": "id-basic", "rqsty-sk-plus": "id-plus" };

test("the admin key labels each saved tier key, keeping its other labels", async () => {
  const org = fakeOrg(ids);
  const result = await labelTierKeys(
    "rqsty-sk-admin",
    { basic: "rqsty-sk-basic", plus: "rqsty-sk-plus" },
    "vocabulary-training",
    org.transport,
  );
  assert.deepEqual(result, {
    labelled: [
      { tier: "basic", name: "Vocab basic" },
      { tier: "plus", name: "Vocab plus" },
    ],
    problems: [],
  });
  assert.deepEqual(org.labels, [
    { id: "id-basic", labels: { team: "lang", app: "vocabulary-training", tier: "basic" } },
    { id: "id-plus", labels: { app: "vocabulary-training", tier: "plus" } },
  ]);
  // Tier keys only ever read themselves; every write uses the admin key.
  for (const call of org.calls.filter((c) => c.method !== "GET"))
    assert.equal(call.auth, "rqsty-sk-admin");
  for (const call of org.calls.filter((c) => c.auth !== "rqsty-sk-admin"))
    assert.deepEqual([call.url, call.method], ["/apikey/self", "GET"]);
});

test("labelling skips an unset plus key and reports problems per tier", async () => {
  const onlyBasic = fakeOrg(ids);
  const basic = await labelTierKeys(
    "rqsty-sk-admin",
    { basic: "rqsty-sk-basic", plus: "" },
    "vt",
    onlyBasic.transport,
  );
  assert.deepEqual(basic, { labelled: [{ tier: "basic", name: "Vocab basic" }], problems: [] });

  const same = fakeOrg(ids);
  const shared = await labelTierKeys(
    "rqsty-sk-admin",
    { basic: "rqsty-sk-basic", plus: "rqsty-sk-basic" },
    "vt",
    same.transport,
  );
  assert.equal(shared.labelled.length, 1);
  assert.match(shared.problems[0], /plus key is the same Requesty key as basic/);
  assert.equal(same.labels.length, 1);

  const refused = fakeOrg(ids, ["rqsty-sk-basic"]);
  const partly = await labelTierKeys(
    "rqsty-sk-admin",
    { basic: "rqsty-sk-basic", plus: "rqsty-sk-plus" },
    "vt",
    refused.transport,
  );
  assert.deepEqual(partly.labelled, [{ tier: "plus", name: "Vocab plus" }]);
  assert.match(partly.problems[0], /^The basic key wasn't labelled/);

  const none = await labelTierKeys(
    "rqsty-sk-admin",
    { basic: "", plus: "" },
    "vt",
    fakeOrg(ids).transport,
  );
  assert.deepEqual(none, {
    labelled: [],
    problems: ["No basic key is saved, so none was labelled."],
  });

  const noAdmin = fakeOrg(ids, ["rqsty-sk-admin"]);
  const blocked = await labelTierKeys(
    "rqsty-sk-admin",
    { basic: "rqsty-sk-basic", plus: "" },
    "vt",
    noAdmin.transport,
  );
  assert.equal(blocked.labelled.length, 0);
  assert.match(blocked.problems[0], /^The tier keys weren't labelled/);
});
