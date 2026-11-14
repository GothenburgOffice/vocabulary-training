import { useLayoutEffect, useState } from "react";
import { applyTheme, type Theme } from "@/lib/theme";
import type { WorkspaceData, WorkspaceSync } from "@/lib/workspace";

// The account's own settings that save on their own: the AI features switch (#113) and the
// Appearance setting. Each change shows at once and is reported to `sync`.
export function useAccountSettings(initial: WorkspaceData, sync?: WorkspaceSync) {
  const [aiEnabled, setAiEnabled] = useState(initial.aiEnabled ?? true);
  function chooseAiEnabled(next: boolean) {
    setAiEnabled(next);
    sync?.saveAiEnabled(next);
  }
  const [theme, setTheme] = useState<Theme>(initial.theme ?? "system");
  // Before paint, so a change never shows a frame in the old scheme.
  useLayoutEffect(() => applyTheme(theme), [theme]);
  function chooseTheme(next: Theme) {
    applyTheme(next);
    setTheme(next);
    sync?.saveTheme(next);
  }
  return { aiEnabled, chooseAiEnabled, theme, chooseTheme };
}
