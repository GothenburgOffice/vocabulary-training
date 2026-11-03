// Public site details shared by the metadata, manifest, robots and sitemap.
export const SITE_NAME = "vocabulary.training";
export const SITE_TAGLINE = "Your own word lists, practised by typing";
export const SITE_DESCRIPTION =
  "Make your own word lists and learn them by typing the answers, with spaced review of the words you miss. No AI required.";
// The page background (--bg in app/style.css).
export const SITE_BACKGROUND = "#f6f7f9";

/**
 * The public origin (APP_ORIGIN), read at request time so one image serves any host.
 * Falls back to the local default from compose.yaml.
 */
export function siteOrigin(env: Record<string, string | undefined> = process.env): URL {
  try {
    return new URL(env.APP_ORIGIN?.trim() || "http://localhost:3420");
  } catch {
    return new URL("http://localhost:3420");
  }
}
