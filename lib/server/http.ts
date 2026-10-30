import { NextResponse } from "next/server";
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
export function fail(error: unknown) {
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  console.error("Request failed:", error instanceof Error ? error.name : "unknown");
  return json({ error: "The server could not complete the request. Please retry." }, 500);
}
export function requireOrigin(request: Request) {
  const expected = process.env.APP_ORIGIN;
  if (!expected) throw new HttpError(503, "The server origin is not configured.");
  if (request.headers.get("origin") !== expected) throw new HttpError(403, "This request is not from this application.");
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new HttpError(415, "Use JSON for this request.");
}
export async function body(request: Request, max = 2_000_000): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > max) throw new HttpError(413, "This workspace is too large. Keep fewer than 100 lists and 200 sessions.");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "A request body is required.");
  const parts: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel(); throw new HttpError(413, "This workspace exceeds the 2 MB storage limit."); }
    parts.push(value);
  }
  try { return JSON.parse(Buffer.concat(parts).toString("utf8")); }
  catch { throw new HttpError(400, "Invalid JSON."); }
}
