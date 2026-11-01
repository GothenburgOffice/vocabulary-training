import { NextResponse } from "next/server";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
export function fail(error: unknown) {
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  console.error("Request failed:", error instanceof Error ? error.name : "unknown");
  return json({ error: "The server could not complete the request. Please retry." }, 500);
}
// APP_ORIGIN is the public origin; APP_ORIGIN_ALIASES optionally adds more, comma-separated.
// Each entry must be written exactly as browsers send it, e.g. https://example.com.
export function allowedOrigins(env: Record<string, string | undefined> = process.env) {
  if (!env.APP_ORIGIN?.trim()) throw new HttpError(503, "The server origin is not configured.");
  const origins = [env.APP_ORIGIN, ...(env.APP_ORIGIN_ALIASES ?? "").split(",")]
    .map((origin) => origin.trim())
    .filter(Boolean);
  for (const origin of origins) {
    let bare = false;
    try {
      bare = new URL(origin).origin === origin;
    } catch {}
    if (!bare) throw new HttpError(503, "The server origin is configured incorrectly.");
  }
  return origins;
}
// Returns the matched origin, so callers can tell HTTPS from HTTP for that request.
export function requireOrigin(request: Request) {
  // Check the configuration first, so a misconfigured server answers 503 to every request.
  const allowed = allowedOrigins();
  const origin = request.headers.get("origin");
  if (!origin || !allowed.includes(origin))
    throw new HttpError(403, "This request is not from this application.");
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new HttpError(415, "Use JSON for this request.");
  return origin;
}
// origin is the request's verified origin from requireOrigin, not APP_ORIGIN, so each alias
// gets the Secure flag that matches its own scheme.
export function cookieOptions(origin: string) {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    path: "/",
    secure: new URL(origin).protocol === "https:",
    maxAge: 60 * 60 * 24 * 14,
  };
}
export async function body(request: Request, max = 2_000_000): Promise<unknown> {
  const tooLarge = () =>
    new HttpError(413, `This request is larger than ${(max / 1_000_000).toFixed(1)} MB.`);
  if (Number(request.headers.get("content-length")) > max) throw tooLarge();
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "A request body is required.");
  const parts: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw tooLarge();
    }
    parts.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(parts).toString("utf8"));
  } catch {
    throw new HttpError(400, "Invalid JSON.");
  }
}
