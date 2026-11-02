import assert from "node:assert/strict";
import test from "node:test";
import {
  appendAiAction,
  decodeAiAction,
  MAX_AI_ACTIONS,
  type AiAction,
} from "../lib/ai-actions.ts";

const action = (id: string): AiAction => ({
  id,
  kind: "note",
  model: "test/model",
  wordId: "word-id",
  word: "bonjour",
  at: "2026-11-02T21:00:00.000Z",
  prompt: { messages: [{ role: "user", content: "à bientôt" }] },
});

test("the client action log keeps only its newest entries", () => {
  const actions = Array.from({ length: MAX_AI_ACTIONS + 2 }, (_, index) => action(`${index}`));
  const result = actions.reduce(appendAiAction, []);
  assert.equal(result.length, MAX_AI_ACTIONS);
  assert.equal(result[0].id, "2");
  assert.equal(result.at(-1)?.id, `${MAX_AI_ACTIONS + 1}`);
});

test("speech action metadata decodes safely from a response header", () => {
  const expected = action("speech");
  expected.kind = "speech";
  expected.word = "冰";
  const encoded = Buffer.from(JSON.stringify(expected)).toString("base64url");
  assert.deepEqual(decodeAiAction(encoded), expected);
  assert.equal(decodeAiAction(null), undefined);
  assert.equal(decodeAiAction("not-base64-json"), undefined);
  assert.equal(
    decodeAiAction(Buffer.from(JSON.stringify({ kind: "other" })).toString("base64url")),
    undefined,
  );
});
