import test from "node:test";
import assert from "node:assert/strict";
import {
  appendAiAction,
  isAiAction,
  MAX_AI_ACTIONS,
  readSpeechMeta,
  speechHeaders,
  type AiAction,
} from "../lib/ai-actions.ts";

const action = (n: number): AiAction => ({
  id: `a${n}`,
  kind: "note",
  at: "2026-11-02T10:00:00.000Z",
  wordId: "w1",
  word: "vi ses snart",
  language: "Swedish",
  model: "novita/ling-3.1-flash",
  prompt: { messages: [{ role: "user", content: String(n) }] },
});

test("the client keeps only the newest actions, in order", () => {
  let actions: AiAction[] = [];
  for (let n = 0; n < MAX_AI_ACTIONS + 5; n++) actions = appendAiAction(actions, action(n));
  assert.equal(actions.length, MAX_AI_ACTIONS);
  assert.equal(actions[0].id, "a5");
  assert.equal(actions[actions.length - 1].id, `a${MAX_AI_ACTIONS + 4}`);
});

test("only well-formed actions are recorded", () => {
  assert.equal(isAiAction(action(1)), true);
  assert.equal(isAiAction({ ...action(1), voice: "Mia" }), true);
  for (const candidate of [
    { ...action(1), kind: "other" },
    { ...action(1), prompt: [] },
    { ...action(1), prompt: null },
    { ...action(1), word: undefined },
    { ...action(1), voice: 3 },
    { ...action(1), at: 1 },
    null,
    "note",
  ])
    assert.equal(isAiAction(candidate), false, JSON.stringify(candidate));
});

test("speech model and voice survive a header, including non-ASCII", () => {
  const headers = new Headers(speechHeaders({ model: "vendor/voice-ö", voice: "Mia" }));
  assert.deepEqual(readSpeechMeta(headers), { model: "vendor/voice-ö", voice: "Mia" });
  const noVoice = new Headers(speechHeaders({ model: "m", voice: "" }));
  assert.deepEqual(readSpeechMeta(noVoice), { model: "m", voice: "" });
});

test("missing or malformed speech headers give no metadata", () => {
  assert.equal(readSpeechMeta(new Headers()), undefined);
  assert.equal(readSpeechMeta(new Headers({ "X-AI-Model": "%E0%A4%A" })), undefined);
});
