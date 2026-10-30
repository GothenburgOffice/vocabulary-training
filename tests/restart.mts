import { readFile, writeFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { makeWord } from "../lib/learning.ts";
const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3013";
const headers = { "Content-Type": "application/json", Origin: base };
const file = process.env.TEST_RESTART_FILE ?? "/tmp/vocabulary-restart-fixture.json";
if (process.argv[2] === "prepare") {
  const response = await fetch(`${base}/api/auth`, { method: "POST", headers, body: JSON.stringify({
    action: "register", email: `restart-${randomUUID()}@example.test`, password: "restart-test-only-password",
  }) });
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie")!.split(";")[0];
  const first = await (await fetch(`${base}/api/workspace`, { headers: { Cookie: cookie } })).json();
  const title = `Survives restart ${randomUUID()}`;
  const data = { ...first.data, lists: [{
    id: "restart", title, description: "", from: "Swedish", to: "French", words: [makeWord("hej", "bonjour", "rw")],
  }] };
  const save = await fetch(`${base}/api/workspace`, { method: "PUT", headers: { ...headers, Cookie: cookie }, body: JSON.stringify({ revision: first.revision, data }) });
  assert.equal(save.status, 200);
  await writeFile(file, JSON.stringify({ cookie, title }), { mode: 0o600 });
  console.log("Disposable account and list prepared for restart verification.");
} else if (process.argv[2] === "verify") {
  const { cookie, title } = JSON.parse(await readFile(file, "utf8"));
  const response = await fetch(`${base}/api/workspace`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  const workspace = await response.json();
  assert.equal(workspace.data.lists[0].title, title);
  await unlink(file);
  console.log("Session and saved list survived the application restart.");
} else throw new Error("Use prepare or verify.");
