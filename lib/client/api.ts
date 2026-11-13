// JSON requests from the browser to this app's API. Every request sends JSON (the routes'
// requireOrigin wants that content type) and skips the HTTP cache. A failed response throws a
// RequestError carrying the status and the server's message; a body that isn't JSON (a proxy's
// error page, say) gives the fallback message instead of a parse error. Browser code only:
// never import server code here.
export class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "RequestError";
  }
}

export type RequestOptions = {
  method?: string;
  // Sent as the JSON body when given.
  data?: unknown;
  signal?: AbortSignal;
  // The message when the server doesn't give one.
  fallback?: string;
};

export async function apiRequest<T = unknown>(
  path: string,
  {
    method = "GET",
    data,
    signal,
    fallback = "The request failed. Please retry.",
  }: RequestOptions = {},
): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    signal,
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
  });
  const result: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const message =
      result && typeof result === "object" && "error" in result && typeof result.error === "string"
        ? result.error
        : "";
    throw new RequestError(message || fallback, response.status);
  }
  if (result === undefined) throw new RequestError(fallback, response.status);
  return result as T;
}
