import { request, type FullConfig } from "@playwright/test";

// The admin's signed-in session, made once per run (sign-ins are rate-limited per email).
export const ADMIN_STATE = "playwright/.auth/admin.json";

// `next dev` compiles each page and route on its first request, which can take longer than a
// test waits. Ask for each once before the tests start; against a production build this is
// instant. Any status will do: the request is only there to compile the route.
const ROUTES = [
  "/",
  "/privacy",
  "/admin/languages",
  "/api/health",
  "/api/auth",
  "/api/workspace",
  "/api/lists/00000000-0000-4000-8000-000000000000",
  "/api/reviews",
  "/api/runs",
  "/api/profile",
  "/api/feedback",
  "/api/speech",
  "/api/admin/languages",
];

export default async function globalSetup(config: FullConfig) {
  const base = config.projects[0].use.baseURL!;
  await Promise.all(ROUTES.map((path) => fetch(base + path).catch(() => undefined)));

  const email = process.env.TEST_ADMIN_EMAIL;
  const password = process.env.TEST_ADMIN_PASSWORD;
  if (!email || !password) return;
  const admin = await request.newContext({ baseURL: base });
  const login = await admin.post("/api/auth", {
    headers: { Origin: new URL(base).origin },
    data: { action: "login", email, password },
  });
  if (!login.ok()) throw new Error(`Admin sign-in failed: ${await login.text()}`);
  await admin.storageState({ path: ADMIN_STATE });
  await admin.dispose();
}
