"use client";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { ReactNode } from "react";
import { nextSort, type Sort, type SortDir } from "../../lib/admin/sort";

// A column heading that sorts its table: click to sort, click again to reverse. The arrow shows
// the current order; the other headings show a faint two-way arrow.
export default function SortHeader<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
  firstDir = "asc",
  className,
  rowSpan,
  title,
}: {
  label: ReactNode;
  sortKey: K;
  sort: Sort<K> | null;
  onSort: (sort: Sort<K>) => void;
  // Text sorts A–Z first; dates and numbers newest or largest first.
  firstDir?: SortDir;
  className?: string;
  rowSpan?: number;
  title?: string;
}) {
  const active = sort?.key === sortKey ? sort.dir : null;
  const Icon = active === "asc" ? ArrowUp : active === "desc" ? ArrowDown : ArrowUpDown;
  return (
    <th
      scope="col"
      rowSpan={rowSpan}
      className={className}
      aria-sort={active === "asc" ? "ascending" : active === "desc" ? "descending" : undefined}
    >
      <button
        type="button"
        className={active ? "sort-button is-sorted" : "sort-button"}
        title={title}
        onClick={() => onSort(nextSort(sort, sortKey, firstDir))}
      >
        {label}
        <Icon size={12} aria-hidden="true" />
      </button>
    </th>
  );
}
