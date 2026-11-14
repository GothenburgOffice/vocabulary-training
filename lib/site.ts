// Public site details shared by the metadata, manifest, robots and sitemap.
export const SITE_NAME = "vocabulary.training";
const SITE_TAGLINE = "Your own word lists, practised by typing";
export const SITE_DESCRIPTION =
  "Make your own word lists and learn them by typing the answers, with spaced review of the words you miss. No AI required.";
// The page background (--bg in app/style.css).
export const SITE_BACKGROUND = "#f6f7f9";

/**
 * The public origin (APP_ORIGIN), read at request time so one image serves any host.
 * Unset, it is the local default from compose.yaml. Set but not a bare origin (as
 * allowedOrigins() in lib/server/http.ts also requires), it throws: share links, robots.txt
 * and the sitemap must never quietly point at localhost on a misconfigured server.
 */
export function siteOrigin(env: Record<string, string | undefined> = process.env): URL {
  const configured = env.APP_ORIGIN?.trim();
  if (!configured) return new URL("http://localhost:3420");
  let origin = "";
  try {
    origin = new URL(configured).origin;
  } catch {}
  if (origin !== configured)
    throw new Error(
      "APP_ORIGIN is configured incorrectly: use a bare origin such as https://example.org.",
    );
  return new URL(origin);
}

// The share image (app/opengraph-image.png, made from brand/og-image.svg).
export const SHARE_IMAGE = {
  url: "/opengraph-image.png",
  width: 1200,
  height: 630,
  type: "image/png",
  alt: `${SITE_NAME}: ${SITE_TAGLINE}`,
};

// Open Graph fields for one page. Next replaces (not merges) a parent's openGraph, and a
// page's own openGraph also drops the root's file-based image, so every page that sets its
// own passes the shared fields and the image through this. The url resolves against
// metadataBase.
export function openGraph(path: string, title = SITE_NAME, description = SITE_DESCRIPTION) {
  return {
    type: "website" as const,
    siteName: SITE_NAME,
    locale: "en",
    url: path,
    title,
    description,
    images: [SHARE_IMAGE],
  };
}
