import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { siteOrigin } from "@/lib/site";

// The public pages (see app/robots.ts), at the APP_ORIGIN the server runs with.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const origin = siteOrigin();
  return ["/", "/privacy"].map((path) => ({ url: new URL(path, origin).href }));
}
