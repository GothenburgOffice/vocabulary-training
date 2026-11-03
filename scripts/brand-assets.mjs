// Regenerates everything derived from the logo masters in brand/: node scripts/brand-assets.mjs
// - brand/*-dark.svg: the dark-mode colourway of each light master
// - app/icon.svg, app/favicon.ico: the small mark on a brand-blue tile
// - app/apple-icon.png, public/icons/*.png: the app icons
// - app/opengraph-image.png: the share preview
// PNGs are rendered with Playwright's Chromium. Where headless Chromium never paints (the
// dev container), run it under Xvfb with HEADED=1.
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const root = new URL("../", import.meta.url);
const brand = (name) => new URL(`brand/${name}`, root);
const out = (path) => new URL(path, root);

// Light → dark colourway (brand blue, ink, page background).
const DARK = { "#1765bf": "#5a9cec", "#202e40": "#f6f7f9", "#f6f7f9": "#0a0c10" };
for (const name of ["mark", "mark-small", "wordmark-1line", "wordmark-2line", "og-image"]) {
  const svg = await readFile(brand(`${name}.svg`), "utf8");
  const dark = svg.replace(/#(1765bf|202e40|f6f7f9)/g, (c) => DARK[c]);
  await writeFile(brand(`${name}-dark.svg`), dark);
}

// The favicon: the small mark, white, on a rounded brand-blue tile (legible on light and dark
// browser tabs alike).
const small = (await readFile(brand("mark-small.svg"), "utf8")).match(/ d="([^"]+)"/)[1];
const favicon =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
  '<rect width="32" height="32" rx="7" fill="#1765bf"/>' +
  `<path fill="#ffffff" fill-rule="evenodd" transform="translate(4 7) scale(0.75)" d="${small}"/>` +
  "</svg>\n";
await writeFile(out("app/icon.svg"), favicon);

const browser = await chromium.launch({ headless: !process.env.HEADED });
const page = await browser.newPage({ deviceScaleFactor: 1 });
async function png(svg, width, height) {
  await page.setViewportSize({ width, height });
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}img{display:block}</style>` +
      `<img src="${src}" width="${width}" height="${height}">`,
  );
  await page.locator("img").evaluate((img) => img.decode());
  return page.screenshot({ clip: { x: 0, y: 0, width, height }, omitBackground: true });
}

const appIcon = await readFile(brand("app-icon.svg"), "utf8");
const maskable = await readFile(brand("app-icon-maskable.svg"), "utf8");
await writeFile(out("app/apple-icon.png"), await png(appIcon, 180, 180));
await writeFile(out("public/icons/192.png"), await png(appIcon, 192, 192));
await writeFile(out("public/icons/512.png"), await png(appIcon, 512, 512));
await writeFile(out("public/icons/maskable-512.png"), await png(maskable, 512, 512));
await writeFile(
  out("app/opengraph-image.png"),
  await png(await readFile(brand("og-image.svg"), "utf8"), 1200, 630),
);

// favicon.ico with 16, 32 and 48 px PNG frames (supported by all current browsers and Windows).
const sizes = [16, 32, 48];
const frames = [];
for (const size of sizes) frames.push(await png(favicon, size, size));
const header = Buffer.alloc(6 + 16 * frames.length);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(frames.length, 4);
let offset = header.length;
frames.forEach((frame, i) => {
  const entry = 6 + 16 * i;
  header.writeUInt8(sizes[i], entry); // width
  header.writeUInt8(sizes[i], entry + 1); // height
  header.writeUInt16LE(1, entry + 4); // colour planes
  header.writeUInt16LE(32, entry + 6); // bits per pixel
  header.writeUInt32LE(frame.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += frame.length;
});
await writeFile(out("app/favicon.ico"), Buffer.concat([header, ...frames]));

await browser.close();
console.log("Brand assets regenerated.");
