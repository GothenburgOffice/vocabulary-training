import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { api } from "./helpers.mts";

test("real HTTP: the Appearance setting is saved on the account and set on every page", async () => {
  const signedOut = await (await api("/")).text();
  assert.match(signedOut, /<html[^>]* data-theme="system"/);
  const reg = await api("/api/auth", "POST", {
    action: "register",
    email: `theme-${randomUUID()}@example.test`,
    password: "integration-test-only-password",
  });
  assert.equal(reg.status, 200, await reg.clone().text());
  const cookie = reg.headers.get("set-cookie")!.split(";")[0];
  const workspace = async () =>
    (await (await api("/api/workspace", "GET", undefined, cookie)).json()).data;
  assert.equal((await workspace()).theme, "system");

  const save = (data: unknown) => api("/api/profile", "PATCH", data, cookie);
  assert.equal((await save({ theme: "sepia" })).status, 400);
  assert.equal((await save({ theme: "dark", baseLanguage: "Swedish" })).status, 400);
  assert.equal((await api("/api/profile", "PATCH", { theme: "dark" })).status, 401);
  const saved = await save({ theme: "dark" });
  assert.equal(saved.status, 200, await saved.clone().text());
  assert.equal((await workspace()).theme, "dark");
  // The page is rendered in the account's scheme, before any script runs.
  for (const path of ["/", "/privacy"]) {
    const html = await (await api(path, "GET", undefined, cookie)).text();
    assert.match(html, /<html[^>]* data-theme="dark"/, path);
  }
  // Saving the languages leaves the theme alone.
  assert.equal((await save({ baseLanguage: "Swedish", learningLanguage: "German" })).status, 200);
  assert.equal((await workspace()).theme, "dark");
});

test("real HTTP: the AI features switch is saved on the account, on its own", async () => {
  const register = async () => {
    const reg = await api("/api/auth", "POST", {
      action: "register",
      email: `ai-switch-${randomUUID()}@example.test`,
      password: "integration-test-only-password",
    });
    assert.equal(reg.status, 200, await reg.clone().text());
    return reg.headers.get("set-cookie")!.split(";")[0];
  };
  const cookie = await register();
  const other = await register();
  const workspace = async (who = cookie) =>
    (await (await api("/api/workspace", "GET", undefined, who)).json()).data;
  assert.equal((await workspace()).aiEnabled, true);

  const save = (data: unknown) => api("/api/profile", "PATCH", data, cookie);
  assert.equal((await save({ aiEnabled: "false" })).status, 400);
  assert.equal((await save({ aiEnabled: false, theme: "dark" })).status, 400);
  assert.equal((await api("/api/profile", "PATCH", { aiEnabled: false })).status, 401);
  const crossOrigin = await api("/api/profile", "PATCH", { aiEnabled: false }, cookie, {
    Origin: "https://attacker.invalid",
  });
  assert.equal(crossOrigin.status, 403);
  assert.equal((await workspace()).aiEnabled, true);

  assert.equal((await save({ aiEnabled: false })).status, 200);
  assert.equal((await workspace()).aiEnabled, false);
  // Only this account's switch.
  assert.equal((await workspace(other)).aiEnabled, true);
  // Off, a language note is refused before any AI setting is read, whatever the stack has.
  // (A note needs a word: the account's own.)
  const listId = randomUUID();
  const wordId = randomUUID();
  const created = await api(
    `/api/lists/${listId}`,
    "PUT",
    {
      revision: null,
      list: {
        title: "AI off",
        description: "",
        from: "Swedish",
        to: "French",
        words: [{ id: wordId, front: "hej", back: "bonjour" }],
      },
    },
    cookie,
  );
  assert.equal(created.status, 200, await created.clone().text());
  const note = await api(
    "/api/feedback",
    "POST",
    { wordId, direction: "forward", answer: "salut", requireAccents: true, caseSensitive: false },
    cookie,
  );
  const noteResult = await note.json();
  assert.equal(noteResult.status, "disabled");
  assert.match(noteResult.message, /turned off in your profile/);
  const clip = await api("/api/speech", "POST", { wordId, part: "native" }, cookie);
  assert.equal(clip.status, 503);
  // Other profile saves leave the switch alone, and the export includes it.
  assert.equal((await save({ theme: "dark" })).status, 200);
  assert.equal((await save({ baseLanguage: "Swedish", learningLanguage: "German" })).status, 200);
  assert.equal((await workspace()).aiEnabled, false);
  const exported = await (await api("/api/export", "GET", undefined, cookie)).json();
  assert.equal(exported.profile.aiEnabled, false);

  assert.equal((await save({ aiEnabled: true })).status, 200);
  assert.equal((await workspace()).aiEnabled, true);
});
