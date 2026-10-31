import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

test("favicon SVG reuses the book mark from the wordmark", () => {
  const path = new URL("../app/icon.svg", import.meta.url);
  assert.ok(existsSync(path), "app/icon.svg is missing");
  const svg = readFileSync(path, "utf8");
  assert.match(svg, /<svg[^>]*viewBox="0 0 24 24"/);
  assert.match(svg, /d="M12 7v14"/);
});

test("/favicon.ico is rewritten to the served icon route", async () => {
  const { default: config } = await import("../next.config.ts");
  const rewrites = await config.rewrites?.();
  const list = Array.isArray(rewrites) ? rewrites : [...(rewrites?.beforeFiles ?? []), ...(rewrites?.afterFiles ?? []), ...(rewrites?.fallback ?? [])];
  const rule = list.find((r) => r.source === "/favicon.ico");
  assert.ok(rule, "/favicon.ico rewrite is missing from next.config.ts");
  assert.equal(rule.destination, "/icon.svg");
  assert.ok(existsSync(new URL("../app/icon.svg", import.meta.url)), "app/icon.svg is missing");
});

test("apple touch icon is a 180px PNG route", async () => {
  const mod = await import("../app/apple-icon.tsx");
  assert.deepEqual(mod.size, { width: 180, height: 180 });
  assert.equal(mod.contentType, "image/png");
  const response = await mod.default();
  assert.equal(response.headers.get("content-type"), "image/png");
});
