import type { Metadata } from "next";
// Served from this site, not Google Fonts, so no visitor data goes to a third party.
import "@fontsource-variable/instrument-sans";
import "./style.css";
import { sessionTheme } from "../lib/server/auth";
export const metadata: Metadata = {
  title: "vocabulary.training",
  description: "Your personal word lists and focused vocabulary practice. No AI required.",
};
export default async function Layout({ children }: { children: React.ReactNode }) {
  // The account's Appearance setting, applied before the first paint (no flash of the wrong
  // scheme, and nothing kept in the browser).
  const theme = await sessionTheme();
  return (
    <html lang="en" data-theme={theme}>
      <body>{children}</body>
    </html>
  );
}
