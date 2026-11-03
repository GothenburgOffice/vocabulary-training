import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
// Served from this site, not Google Fonts, so no visitor data goes to a third party.
import "@fontsource-variable/instrument-sans";
import "./style.css";
import { BRAND_BLUE } from "../lib/brand";
import { SITE_DESCRIPTION, SITE_NAME, openGraph, siteOrigin } from "../lib/site";

export const viewport: Viewport = { themeColor: BRAND_BLUE };

// Built at request time: one image serves any APP_ORIGIN, and share links must be absolute.
export async function generateMetadata(): Promise<Metadata> {
  await connection();
  const origin = siteOrigin();
  return {
    metadataBase: origin,
    title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
    description: SITE_DESCRIPTION,
    applicationName: SITE_NAME,
    openGraph: openGraph("/"),
    twitter: { card: "summary_large_image", title: SITE_NAME, description: SITE_DESCRIPTION },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
