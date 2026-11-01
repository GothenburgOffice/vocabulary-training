// Admin sections, in navigation order. To add one, create app/admin/<slug>/page.tsx (which
// calls adminPage()), put its components in components/admin/ and its API in
// app/api/admin/<slug>/ (requireOrigin, then requireAdmin), then list it here.
export type AdminSection = { href: string; title: string; description: string };
export const ADMIN_SECTIONS: AdminSection[] = [
  { href: "/admin", title: "Overview", description: "Accounts on this server." },
];
