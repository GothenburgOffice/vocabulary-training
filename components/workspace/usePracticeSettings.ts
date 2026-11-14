import { useEffect, useState } from "react";
import {
  DEFAULT_SETTINGS,
  readSettings,
  SETTINGS_KEY,
  type PracticeSettings,
} from "@/lib/practice";

// The practice settings, remembered in this browser only (#67); private windows or blocked
// storage use the defaults.
export function usePracticeSettings() {
  const [settings, setSettings] = useState<PracticeSettings>(() => {
    try {
      return readSettings(localStorage.getItem(SETTINGS_KEY));
    } catch {
      return DEFAULT_SETTINGS;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {}
  }, [settings]);
  return [settings, setSettings] as const;
}
