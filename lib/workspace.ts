import type { Direction, List, Word } from "./learning";

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
// How Workspace reports each change to save; AccountApp sends them to the API in order.
export type WorkspaceSync = {
  saveList: (list: List) => void;
  review: (wordId: string, direction: Direction, correct: boolean) => void;
  completeRun: (run: Run) => void;
  saveProfile: (baseLanguage: string, learningLanguage: string) => void;
};
