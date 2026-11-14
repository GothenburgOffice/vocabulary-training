import { apiRequest } from "@/lib/client/api";

// JSON requests from admin pages; errors carry the server's message.
export function adminRequest<T>(path: string, method = "GET", data?: unknown): Promise<T> {
  return apiRequest<T>(path, { method, data });
}
