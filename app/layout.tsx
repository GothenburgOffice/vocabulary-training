import type { Metadata } from "next";
import "./style.css";
export const metadata: Metadata = {
  title: "vocabulary.training",
  description: "Your personal word lists and focused vocabulary practice. No AI required.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
