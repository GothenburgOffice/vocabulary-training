import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { BRAND_BLUE, MARK, MARK_SMALL } from "../lib/brand.tsx";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url));

// Width and height from a PNG's IHDR chunk.
function pngSize(png: Buffer) {
  assert.ok(png.subarray(0, 8).equals(PNG_SIGNATURE), "not a PNG");
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

test("the code's mark paths match the brand masters", () => {
  const mark = read("brand/mark.svg").toString();
  assert.ok(mark.includes(`viewBox="${MARK.viewBox}"`));
  assert.ok(mark.includes(`d="${MARK.d}"`), "lib/brand MARK differs from brand/mark.svg");
  const small = read("brand/mark-small.svg").toString();
  assert.ok(small.includes(`viewBox="${MARK_SMALL.viewBox}"`));
  assert.ok(small.includes(`d="${MARK_SMALL.d}"`), "MARK_SMALL differs from brand/mark-small.svg");
});

test("each dark master is its light master in the dark colourway", () => {
  const dark: Record<string, string> = {
    "#1765bf": "#5a9cec",
    "#202e40": "#f6f7f9",
    "#f6f7f9": "#0a0c10",
  };
  for (const name of ["mark", "mark-small", "wordmark-1line", "wordmark-2line", "og-image"]) {
    const light = read(`brand/${name}.svg`).toString();
    const expected = light.replace(/#(1765bf|202e40|f6f7f9)/g, (c) => dark[c]);
    assert.equal(read(`brand/${name}-dark.svg`).toString(), expected, `brand/${name}-dark.svg`);
  }
});

test("favicon SVG is the small mark on a brand-blue tile", () => {
  const path = new URL("../app/icon.svg", import.meta.url);
  assert.ok(existsSync(path), "app/icon.svg is missing");
  const svg = readFileSync(path, "utf8");
  assert.ok(svg.includes(`fill="${BRAND_BLUE}"`), "icon.svg colour differs from lib/brand");
  assert.ok(svg.includes(`d="${MARK_SMALL.d}"`), "icon.svg is not the small mark");
});

test("brand colour matches the --blue CSS token", () => {
  const css = read("app/style.css").toString();
  assert.match(css, new RegExp(`--blue:\\s*${BRAND_BLUE}`, "i"));
});

test("favicon.ico is a real ICO with 16, 32 and 48 px PNG frames", () => {
  const ico = read("app/favicon.ico");
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

test("the touch icon, manifest icons and share image are PNGs of the right size", () => {
  const expected: [string, number, number][] = [
    ["app/apple-icon.png", 180, 180],
    ["public/icons/192.png", 192, 192],
    ["public/icons/512.png", 512, 512],
    ["public/icons/maskable-512.png", 512, 512],
    ["app/opengraph-image.png", 1200, 630],
  ];
  for (const [path, width, height] of expected)
    assert.deepEqual(pngSize(read(path)), { width, height }, path);
});
