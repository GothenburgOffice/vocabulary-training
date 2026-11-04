// Admin sections, in navigation order. To add one, create app/admin/<slug>/page.tsx (which
// calls adminPage()), put its components in components/admin/ and its API in
// app/api/admin/<slug>/ (requireOrigin, then requireAdmin), then list it here.
export type AdminSection = { href: string; title: string; description: string };
export const ADMIN_SECTIONS: AdminSection[] = [
  { href: "/admin", title: "Overview", description: "Accounts and AI usage on this server." },
  {
    href: "/admin/users",
    title: "Users",
    description: "Account details, per-account AI usage, account types, locks and the trash.",
  },
  {
    href: "/admin/ai",
    title: "AI settings",
    description: "Requesty keys and the language-note model per account type.",
  },
  {
    href: "/admin/limits",
    title: "Limits",
    description: "AI usage and saves per account, so one account or script can't run away.",
  },
  {
    href: "/admin/languages",
    title: "Languages",
    description: "Languages offered in the app, their CSV codes and speech settings.",
  },
  {
    href: "/admin/reports",
    title: "Reports",
    description: "AI results learners reported, newest first, and pruning old reports.",
  },
  {
    href: "/admin/registration",
    title: "Registration",
    description: "Open or close sign-up, and the privacy details it needs first.",
  },
];
