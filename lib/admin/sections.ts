// Admin sections, in navigation order. To add one, create app/admin/<slug>/page.tsx (which
// calls adminPage()), put its components in components/admin/ and its API in
// app/api/admin/<slug>/ (requireOrigin, then requireAdmin), then list it here.
export type AdminSection = { href: string; title: string; description: string };
export const ADMIN_SECTIONS: AdminSection[] = [
  { href: "/admin", title: "Overview", description: "Accounts on this server." },
  {
    href: "/admin/ai",
    title: "AI settings",
    description: "Requesty keys and the language-note model for basic and plus accounts.",
  },
  {
    href: "/admin/languages",
    title: "Languages",
    description: "Languages offered in the app, their CSV codes and speech settings.",
  },
  {
    href: "/admin/privacy",
    title: "Privacy",
    description: "The data controller and privacy contact. Registration needs both.",
  },
];
