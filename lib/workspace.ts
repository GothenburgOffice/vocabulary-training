import type { Direction, List, Word } from "./learning";

export type Result = { word: Word; answer: string; correct: boolean; direction: Direction };
export type Run = { id?: string; completedAt?: number; title: string; from: string; to: string; results: Result[] };
export type WorkspaceData = {
  baseLanguage: string;
  learningLanguage: string;
  lists: List[];
  runs: Run[];
};
export const emptyWorkspace = (): WorkspaceData => ({
  baseLanguage: "Swedish", learningLanguage: "French", lists: [], runs: [],
});
