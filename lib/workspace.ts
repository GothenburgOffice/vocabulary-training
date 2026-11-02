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
  // Resolves once the server answers: false if another tab changed the list, so it stays.
  deleteList: (listId: string) => Promise<boolean>;
  // Resolves with the word's state on the server once saved, or null if the word is gone.
  review: (review: Review) => Promise<History | null>;
  completeRun: (run: Run) => void;
  saveProfile: (baseLanguage: string, learningLanguage: string) => void;
  // Whether the workspace holds edits it hasn't reported yet (an unfinished row, pasted text
  // not imported, a change still waiting to autosave). They count as unsaved changes.
  pending: (pending: boolean) => void;
};
// Whether everything the workspace reported to WorkspaceSync is saved.
export type SaveState = "saved" | "unsaved" | "saving" | "failed";
// The signed-in account, as the workspace's sidebar and account dialog show it.
export type WorkspaceAccount = {
  email: string;
  isAdmin: boolean;
  save: SaveState;
  // Why the last save failed; saving waits for onRetry.
  saveError: string;
  busy: boolean;
  onRetry: () => void;
  onSignOut: () => void;
};
