import { test } from "node:test";
import assert from "node:assert/strict";
import { EXPORT_FORMAT, EXPORT_VERSION, exportDocument, exportFileName } from "../lib/export.ts";
import { freshHistory } from "../lib/learning.ts";
import type { WorkspaceData } from "../lib/workspace.ts";

const now = new Date("2026-11-03T08:30:00Z");
const account = {
  email: "learner@example.test",
  createdAt: new Date("2026-10-01T12:00:00Z"),
  accountType: "basic",
  lastSignInAt: null,
};
const due = Date.parse("2026-11-04T00:00:00Z");
const data: WorkspaceData = {
  baseLanguage: "Swedish",
  learningLanguage: "French",
  theme: "dark",
  aiEnabled: false,
  lists: [
    {
      id: "list-1",
      title: "Food",
      description: "Kitchen words",
      from: "Swedish",
      to: "French",
      words: [
        {
          id: "word-1",
          front: "äpple",
          back: "pomme",
          accepted: ["la pomme"],
          forward: {
            ...freshHistory(),
            correct: 2,
            wrong: 1,
            streak: 1,
            due,
            state: "review",
            stability: 4.5,
            difficulty: 6.2,
            lapses: 1,
            scheduledDays: 4,
            lastReview: due - 4 * 86400000,
          },
          reverse: freshHistory(),
        },
      ],
    },
  ],
  runs: [
    {
      id: "run-1",
      listId: "list-1",
      mode: "weighted",
      completedAt: due,
      title: "Food",
      from: "Swedish",
      to: "French",
      results: [
        {
          word: { id: "word-1", front: "äpple", back: "pomme" },
          answer: "pome",
          correct: false,
          direction: "forward",
          answeredAt: due,
        },
        // Asked in reverse: the learning-language side was the prompt.
        {
          word: { id: "word-1", front: "äpple", back: "pomme" },
          answer: "äple",
          correct: false,
          direction: "reverse",
          answeredAt: 0,
        },
      ],
    },
    { title: "Old session", from: "Swedish", to: "French", results: [] },
  ],
};

test("the data export holds the account, lists with review history, sessions and AI usage", () => {
  const doc = exportDocument(
    {
      account,
      data,
      reviewEvents: [
        {
          wordId: "word-1",
          direction: "forward",
          correct: false,
          at: new Date("2026-11-01T09:00:00Z"),
        },
        {
          wordId: "word-1",
          direction: "forward",
          correct: true,
          at: new Date("2026-11-02T09:00:00Z"),
        },
        {
          wordId: "gone",
          direction: "forward",
          correct: true,
          at: new Date("2026-11-02T09:00:00Z"),
        },
      ],
      aiUsage: [{ kind: "speech", letters: 5, at: new Date("2026-11-02T10:00:00Z") }],
    },
    now,
  );
  assert.equal(doc.format, EXPORT_FORMAT);
  assert.equal(doc.version, EXPORT_VERSION);
  assert.equal(doc.exportedAt, "2026-11-03T08:30:00.000Z");
  assert.deepEqual(doc.account, {
    email: "learner@example.test",
    createdAt: "2026-10-01T12:00:00.000Z",
    accountType: "basic",
    lastSignInAt: null,
  });
  assert.deepEqual(doc.profile, {
    baseLanguage: "Swedish",
    learningLanguage: "French",
    theme: "dark",
    aiEnabled: false,
  });
  assert.deepEqual(doc.lists[0].words[0], {
    id: "word-1",
    prompt: "äpple",
    answers: ["pomme", "la pomme"],
    review: {
      forward: {
        correct: 2,
        wrong: 1,
        streak: 1,
        due: "2026-11-04T00:00:00.000Z",
        fsrs: {
          state: "review",
          stability: 4.5,
          difficulty: 6.2,
          steps: 0,
          lapses: 1,
          scheduledDays: 4,
          lastReview: "2026-10-31T00:00:00.000Z",
        },
      },
      // Never practised this way: nothing is scheduled.
      reverse: {
        correct: 0,
        wrong: 0,
        streak: 0,
        due: null,
        fsrs: {
          state: "new",
          stability: 0,
          difficulty: 0,
          steps: 0,
          lapses: 0,
          scheduledDays: 0,
          lastReview: null,
        },
      },
    },
    // The answer log: every checked answer, oldest first.
    answerLog: [
      { direction: "forward", correct: false, at: "2026-11-01T09:00:00.000Z" },
      { direction: "forward", correct: true, at: "2026-11-02T09:00:00.000Z" },
    ],
  });
  assert.equal(doc.lists[0].baseLanguage, "Swedish");
  assert.equal(doc.lists[0].learningLanguage, "French");
  assert.deepEqual(doc.sessions[0].results[0], {
    prompt: "äpple",
    expected: "pomme",
    answer: "pome",
    correct: false,
    direction: "forward",
    answeredAt: "2026-11-04T00:00:00.000Z",
  });
  // A reverse answer swaps prompt and expected; the epoch is a time, not a missing one.
  assert.deepEqual(doc.sessions[0].results[1], {
    prompt: "pomme",
    expected: "äpple",
    answer: "äple",
    correct: false,
    direction: "reverse",
    answeredAt: "1970-01-01T00:00:00.000Z",
  });
  // Missing fields are null, never dropped, so every session has the same keys.
  assert.deepEqual(doc.sessions[1], {
    id: null,
    listId: null,
    title: "Old session",
    mode: null,
    baseLanguage: "Swedish",
    learningLanguage: "French",
    completedAt: null,
    results: [],
  });
  assert.deepEqual(doc.aiUsage, [{ kind: "speech", letters: 5, at: "2026-11-02T10:00:00.000Z" }]);
  // Round-trips through JSON unchanged: no Dates or undefined left inside.
  assert.deepEqual(JSON.parse(JSON.stringify(doc)), doc);
});

test("the export file is named by its UTC date", () => {
  assert.equal(exportFileName(now), "vocabulary-training-export-2026-11-03.json");
});
