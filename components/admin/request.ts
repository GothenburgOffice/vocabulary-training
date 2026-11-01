// JSON requests from admin pages; errors carry the server's message.
export async function adminRequest<T>(path: string, method = "GET", data?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "The request failed. Please retry.");
  return result as T;
}
