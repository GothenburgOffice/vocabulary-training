import test from "node:test";
import assert from "node:assert/strict";
import { api, origin } from "./helpers.mts";

test("real HTTP: share previews, manifest, robots and sitemap use the server's origin", async () => {
  const page = await (await api("/")).text();
  const image = page.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
  assert.ok(image, "the front page has an og:image");
  assert.equal(new URL(image).origin, new URL(origin).origin);
  assert.match(page, /<meta name="twitter:card" content="summary_large_image"/);
  // Each page names its own URL.
  // (Next writes the front page's URL as the bare origin.)
  const home = page.match(/<meta property="og:url" content="([^"]+)"/)?.[1];
  assert.equal(home && new URL(home).href, new URL("/", origin).href);
  const privacy = await (await api("/privacy")).text();
  assert.ok(
    privacy.includes(`<meta property="og:url" content="${new URL("/privacy", origin).href}"/>`),
  );
  // …and keeps the share image, which a page's own openGraph would otherwise drop.
  for (const html of [page, privacy]) {
    assert.match(html, /<meta property="og:image" content="[^"]*\/opengraph-image\.png/);
    assert.match(html, /<meta name="twitter:image" content="[^"]*\/opengraph-image\.png/);
    assert.equal(html.match(/<meta property="og:image" /g)?.length, 1, "one og:image");
  }
  assert.match(page, /<link rel="manifest" href="\/manifest.webmanifest"/);

  const preview = await api(new URL(image).pathname + new URL(image).search);
  assert.equal(preview.status, 200);
  assert.equal(preview.headers.get("content-type"), "image/png");

  const manifest = await (await api("/manifest.webmanifest")).json();
  assert.equal(manifest.display, "standalone");
  for (const icon of manifest.icons as { src: string }[]) {
    const res = await api(icon.src);
    assert.equal(res.status, 200, icon.src);
    assert.equal(res.headers.get("content-type"), "image/png");
  }

  const robots = await (await api("/robots.txt")).text();
  assert.match(robots, /Disallow: \/admin/);
  assert.match(robots, /Disallow: \/api\//);
  assert.ok(robots.includes(`Sitemap: ${new URL("/sitemap.xml", origin).href}`));
  const sitemap = await (await api("/sitemap.xml")).text();
  assert.ok(sitemap.includes(`<loc>${new URL("/privacy", origin).href}</loc>`));
  assert.ok(!sitemap.includes("/admin"));
});
