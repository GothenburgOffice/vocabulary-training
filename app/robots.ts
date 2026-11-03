import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { siteOrigin } from "../lib/site";

// Only the front page and the privacy page are public. The workspace behind sign-in, the
// admin area and the API are not for search engines (the admin layout is noindex too).
export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection();
  const origin = siteOrigin();
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api/"] },
    sitemap: new URL("/sitemap.xml", origin).href,
  };
}
