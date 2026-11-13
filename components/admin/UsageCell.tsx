"use client";
import { Ban, CircleCheck } from "lucide-react";
import { useId, useRef, useState, type CSSProperties } from "react";
import { dailyLimitReached, type Usage } from "@/lib/admin/users";

const PERIODS = [
  { name: "day", label: "24 hours", days: 1 },
  { name: "week", label: "7 days", days: 7 },
  { name: "90", label: "90 days", days: 90 },
] as const;
const number = (value: number) => value.toLocaleString("en");

// Whether the daily limit blocks the account now, in words.
export function limitState(usage: Usage, dailyBudget: number) {
  if (dailyLimitReached(usage.day.letters, dailyBudget))
    return "Daily limit reached: further requests are refused until older usage leaves the 24 hours.";
  return dailyBudget
    ? `Within the daily limit: ${number(Math.max(0, dailyBudget - usage.day.letters))} letters left in the last 24 hours. A longer request is refused.`
    : "No daily limit.";
}

// Calls and letters for every period, against the account type's budget.
export function UsageBreakdown({ usage, dailyBudget }: { usage: Usage; dailyBudget: number }) {
  return (
    <table className="usage-breakdown">
      <thead>
        <tr>
          <th scope="col">Last</th>
          <th scope="col">Calls</th>
          <th scope="col">Letters</th>
          <th scope="col">Budget</th>
        </tr>
      </thead>
      <tbody>
        {PERIODS.map((period) => (
          <tr key={period.name}>
            <th scope="row">{period.label}</th>
            <td>{number(usage[period.name].calls)}</td>
            <td>{number(usage[period.name].letters)}</td>
            <td>{dailyBudget ? number(dailyBudget * period.days) : "unlimited"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// The 90 days' letters (calls in brackets) with an icon for the daily limit.
export function UsageStat({ usage, dailyBudget }: { usage: Usage; dailyBudget: number }) {
  return (
    <>
      {dailyLimitReached(usage.day.letters, dailyBudget) ? (
        <Ban size={14} className="usage-blocked" aria-label="Daily limit reached" />
      ) : (
        <CircleCheck size={14} className="usage-ok" aria-label="Not limited" />
      )}
      {number(usage["90"].letters)} <small>({number(usage["90"].calls)})</small>
    </>
  );
}

// One feature's AI usage in the account list. Hover or focus shows every period in a tooltip,
// placed against the window so the table's scrolling frame doesn't clip it.
export default function UsageCell({
  label,
  usage,
  dailyBudget,
  tier,
}: {
  label: string;
  usage: Usage;
  // The account type's daily letter limit; 0 is no limit.
  dailyBudget: number;
  tier: string;
}) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState<CSSProperties | null>(null);

  function show() {
    const box = anchor.current?.getBoundingClientRect();
    if (!box) return;
    const right = Math.max(8, window.innerWidth - box.right);
    // Below the number, or above it near the bottom of the window.
    setPosition(
      box.bottom > window.innerHeight - 180
        ? { right, bottom: window.innerHeight - box.top + 6 }
        : { right, top: box.bottom + 6 },
    );
  }

  return (
    <td className="cell num usage">
      <span
        ref={anchor}
        className="usage-stat"
        tabIndex={0}
        aria-describedby={id}
        onMouseEnter={show}
        onMouseLeave={() => setPosition(null)}
        onFocus={show}
        onBlur={() => setPosition(null)}
      >
        <UsageStat usage={usage} dailyBudget={dailyBudget} />
      </span>
      <div
        role="tooltip"
        id={id}
        className="usage-tip"
        hidden={!position}
        style={position ?? undefined}
      >
        <strong>
          {label} ({tier})
        </strong>
        <UsageBreakdown usage={usage} dailyBudget={dailyBudget} />
        <p>{limitState(usage, dailyBudget)}</p>
      </div>
    </td>
  );
}
