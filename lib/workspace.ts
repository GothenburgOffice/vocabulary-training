import type { Direction, History, List, Word } from "./learning";

// A result keeps only the word's text, not its review history (issue #7).
export type ResultWord = Pick<Word, "id" | "front" | "back">;
export type Result = {
  word: ResultWord;
  answer: string;
  correct: boolean;
  direction: Direction;
  answeredAt?: number;
};
export type Run = {
  id?: string;
  completedAt?: number;
  listId?: string;
  mode?: string;
  title: string;
  from: string;
  to: string;
  results: Result[];
};
export type WorkspaceData = {
  baseLanguage: string;
  learningLanguage: string;
  lists: List[];
  runs: Run[];
};
// One checked answer. The id is made once per answer, so a retried save counts it once.
export type Review = { id: string; wordId: string; direction: Direction; correct: boolean };
// How Workspace reports each change to save; AccountApp sends them to the API in order.
export type WorkspaceSync = {
  saveList: (list: List) => void;
  // Resolves with the word's state on the server once saved, or null if the word is gone.
  review: (review: Review) => Promise<History | null>;
  completeRun: (run: Run) => void;
  saveProfile: (baseLanguage: string, learningLanguage: string) => void;
};
