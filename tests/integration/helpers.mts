// Shared by the integration tests: they run against a live stack at TEST_BASE_URL, sending
// TEST_ORIGIN as the Origin header (it must be APP_ORIGIN or one of APP_ORIGIN_ALIASES).
const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3013";
export const origin = process.env.TEST_ORIGIN ?? base;
const headers = { "Content-Type": "application/json", Origin: origin };
export async function api(path: string, method = "GET", data?: unknown, cookie = "", extra = {}) {
  return fetch(base + path, {
    method,
    headers: { ...headers, Cookie: cookie, ...extra },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
  });
}
