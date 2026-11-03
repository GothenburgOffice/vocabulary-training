import type { MetadataRoute } from "next";
import { BRAND_BLUE } from "../lib/brand";
import { SITE_BACKGROUND, SITE_DESCRIPTION, SITE_NAME } from "../lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: "Vocabulary",
    description: SITE_DESCRIPTION,
    start_url: "/",
    scope: "/",
    display: "standalone",
    theme_color: BRAND_BLUE,
    background_color: SITE_BACKGROUND,
    icons: [
      { src: "/icons/192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
