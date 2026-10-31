import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { BOOK_PATHS, BRAND_BLUE } from "../lib/brand.tsx";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test("favicon SVG uses the shared brand colour and book mark", () => {
  const path = new URL("../app/icon.svg", import.meta.url);
  assert.ok(existsSync(path), "app/icon.svg is missing");
  const svg = readFileSync(path, "utf8");
  assert.match(svg, /<svg[^>]*viewBox="0 0 24 24"/);
  assert.ok(svg.includes(`fill="${BRAND_BLUE}"`), "icon.svg colour differs from lib/brand");
  for (const d of BOOK_PATHS) assert.ok(svg.includes(`d="${d}"`), `icon.svg is missing path ${d}`);
});

test("brand colour matches the --blue CSS token", () => {
  const css = readFileSync(new URL("../app/style.css", import.meta.url), "utf8");
  assert.match(css, new RegExp(`--blue:\\s*${BRAND_BLUE}`, "i"));
});

test("favicon.ico is a real ICO with 16, 32 and 48 px PNG frames", () => {
  const ico = readFileSync(new URL("../app/favicon.ico", import.meta.url));
  assert.equal(ico.readUInt16LE(0), 0, "reserved field");
  assert.equal(ico.readUInt16LE(2), 1, "ICO type");
  const count = ico.readUInt16LE(4);
  const sizes = [];
  for (let i = 0; i < count; i++) {
    const entry = 6 + 16 * i;
    sizes.push(ico.readUInt8(entry));
    const length = ico.readUInt32LE(entry + 8);
    const offset = ico.readUInt32LE(entry + 12);
    assert.ok(offset + length <= ico.length, "frame lies inside the file");
    assert.ok(ico.subarray(offset, offset + 8).equals(PNG_SIGNATURE), "frame is a PNG");
  }
  assert.deepEqual(sizes, [16, 32, 48]);
});

test("/favicon.ico is served by Next.js from app/favicon.ico, not rewritten", async () => {
  const { default: config } = await import("../next.config.ts");
  assert.equal(config.rewrites, undefined);
});

test("apple touch icon is a 180px PNG route", async () => {
  const mod = await import("../app/apple-icon.tsx");
  assert.deepEqual(mod.size, { width: 180, height: 180 });
  assert.equal(mod.contentType, "image/png");
  const response = await mod.default();
  assert.equal(response.headers.get("content-type"), "image/png");
});
