import { Check, CircleAlert, CircleDot, LoaderCircle } from "lucide-react";
import type { SaveState } from "../../lib/workspace";

const LABELS: Record<SaveState, string> = {
  saved: "All changes saved",
  unsaved: "Unsaved changes",
  saving: "Saving changes…",
  failed: "Changes not saved",
};
const ICONS = { saved: Check, unsaved: CircleDot, saving: LoaderCircle, failed: CircleAlert };

// Whether the workspace is saved. `compact` shows only the icon; the text stays for screen
// readers and as a tooltip.
export default function SaveStatus({ state, compact }: { state: SaveState; compact?: boolean }) {
  const Icon = ICONS[state];
  return (
    <span className={`save-state ${state}`} role="status" title={LABELS[state]}>
      <Icon size={14} aria-hidden="true" />
      <span className={compact ? "visually-hidden" : undefined}>{LABELS[state]}</span>
    </span>
  );
}
