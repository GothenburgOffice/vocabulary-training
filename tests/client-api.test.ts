import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { apiRequest, RequestError } from "../lib/client/api.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});
function respond(body: string, status = 200, type = "application/json") {
  const calls: [string, RequestInit][] = [];
  globalThis.fetch = (async (path: string, init: RequestInit) => {
    calls.push([path, init]);
    return new Response(body, { status, headers: { "Content-Type": type } });
  }) as typeof fetch;
  return calls;
}

describe("apiRequest", () => {
  it("sends JSON and returns the parsed body", async () => {
    const calls = respond('{"revision":3}');
    const result = await apiRequest<{ revision: number }>("/api/lists/a", {
      method: "PUT",
      data: { title: "x" },
    });
    assert.deepEqual(result, { revision: 3 });
    const [path, init] = calls[0];
    assert.equal(path, "/api/lists/a");
    assert.equal(init.method, "PUT");
    assert.equal(init.body, '{"title":"x"}');
    assert.equal(init.cache, "no-store");
    assert.deepEqual(init.headers, { "Content-Type": "application/json" });
  });

  it("sends no body without data", async () => {
    const calls = respond("{}");
    await apiRequest("/api/workspace");
    assert.equal(calls[0][1].method, "GET");
    assert.equal(calls[0][1].body, undefined);
  });

  it("throws the server's message and status", async () => {
    respond('{"error":"Changed in another tab."}', 409);
    await assert.rejects(apiRequest("/api/lists/a"), (e) => {
      assert.ok(e instanceof RequestError);
      assert.equal(e.status, 409);
      assert.equal(e.message, "Changed in another tab.");
      return true;
    });
  });

  it("uses the fallback for an error page that isn't JSON", async () => {
    respond("<html>502 Bad Gateway</html>", 502, "text/html");
    await assert.rejects(apiRequest("/api/reports", { fallback: "Not sent." }), (e) => {
      assert.ok(e instanceof RequestError);
      assert.equal(e.status, 502);
      assert.equal(e.message, "Not sent.");
      return true;
    });
  });

  it("treats a success that isn't JSON as a failure", async () => {
    respond("ok", 200, "text/plain");
    await assert.rejects(apiRequest("/api/workspace"), RequestError);
  });
});
