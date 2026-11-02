// Admin sections, in navigation order. To add one, create app/admin/<slug>/page.tsx (which
// calls adminPage()), put its components in components/admin/ and its API in
// app/api/admin/<slug>/ (requireOrigin, then requireAdmin), then list it here.
export type AdminSection = { href: string; title: string; description: string };
export const ADMIN_SECTIONS: AdminSection[] = [
  { href: "/admin", title: "Overview", description: "Accounts and AI usage on this server." },
  {
    href: "/admin/users",
    title: "Users",
    description: "Account details, per-account AI usage, account types and deletion.",
  },
  {
    href: "/admin/ai",
    title: "AI settings",
    description: "Requesty keys and the language-note model for basic and plus accounts.",
  },
  {
    href: "/admin/limits",
    title: "Limits",
    description: "How much each account may use speech and language notes, per minute and day.",
  },
  {
    href: "/admin/languages",
    title: "Languages",
    description: "Languages offered in the app, their CSV codes and speech settings.",
  },
  {
    href: "/admin/registration",
    title: "Registration",
    description: "Open or close sign-up, and the privacy details it needs first.",
  },
];
