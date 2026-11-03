import test from "node:test";
import assert from "node:assert/strict";
import { openGraph, siteOrigin } from "../lib/site.ts";

test("the site origin is APP_ORIGIN, the local default when unset, and refused when malformed", () => {
  assert.equal(siteOrigin({}).href, "http://localhost:3420/");
  assert.equal(siteOrigin({ APP_ORIGIN: " " }).href, "http://localhost:3420/");
  assert.equal(
    siteOrigin({ APP_ORIGIN: "https://vocab.example.test" }).origin,
    "https://vocab.example.test",
  );
  // Never a quiet fallback to localhost: the same rule as the API's allowedOrigins().
  for (const bad of ["not a url", "https://vocab.example.test/", "https://vocab.example.test/app"])
    assert.throws(() => siteOrigin({ APP_ORIGIN: bad }), /APP_ORIGIN/, bad);
});

test("each page's Open Graph fields carry its own url and the shared site fields", () => {
  const privacy = openGraph("/privacy", "Privacy", "What is stored");
  assert.deepEqual(privacy, {
    type: "website",
    siteName: "vocabulary.training",
    locale: "en",
    url: "/privacy",
    title: "Privacy",
    description: "What is stored",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        type: "image/png",
        alt: "vocabulary.training: Your own word lists, practised by typing",
      },
    ],
  });
  assert.equal(openGraph("/").title, "vocabulary.training");
});
