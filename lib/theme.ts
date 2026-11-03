// The Appearance setting (#106), saved on the account. "system" follows the device's
// prefers-color-scheme; the stylesheet reads data-theme on <html> (see the colour tokens).
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_LABELS: Record<Theme, string> = {
  system: "System default",
  light: "Light",
  dark: "Dark",
};
export const isTheme = (value: unknown): value is Theme =>
  typeof value === "string" && (THEMES as readonly string[]).includes(value);

// Shows a theme at once, before (and whether or not) it is saved.
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}
