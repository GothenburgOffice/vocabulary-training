import type { FullConfig } from "@playwright/test";

// `next dev` compiles each page and route on its first request, which can take longer than a
// test waits. Ask for each once before the tests start; against a production build this is
// instant. Any status will do: the request is only there to compile the route.
const ROUTES = [
  "/",
  "/privacy",
  "/api/health",
  "/api/auth",
  "/api/workspace",
  "/api/lists/00000000-0000-4000-8000-000000000000",
  "/api/reviews",
  "/api/runs",
  "/api/profile",
  "/api/feedback",
  "/api/speech",
];

export default async function warmUp(config: FullConfig) {
  const base = config.projects[0].use.baseURL!;
  await Promise.all(ROUTES.map((path) => fetch(base + path).catch(() => undefined)));
}
