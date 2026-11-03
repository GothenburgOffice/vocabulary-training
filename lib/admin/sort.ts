// Sorting admin tables by a column heading: the first click sorts in the column's natural
// direction (A–Z for text, newest or most first for dates and numbers), the next reverses it.
export type SortDir = "asc" | "desc";
export type Sort<K extends string> = { key: K; dir: SortDir };

export function nextSort<K extends string>(
  current: Sort<K> | null,
  key: K,
  firstDir: SortDir,
): Sort<K> {
  if (current?.key === key) return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  return { key, dir: firstDir };
}
