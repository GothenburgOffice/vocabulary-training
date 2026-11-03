import { ImageResponse } from "next/og";
import { BrandIcon } from "../../../lib/brand";

// PNG icons for the web app manifest (app/manifest.ts). The maskable one fills the whole
// square and keeps the mark inside the central safe zone, since the platform crops it.
const ICONS: Record<string, { size: number; maskable: boolean }> = {
  "192.png": { size: 192, maskable: false },
  "512.png": { size: 512, maskable: false },
  "maskable-512.png": { size: 512, maskable: true },
};

export const dynamicParams = false;
export function generateStaticParams() {
  return Object.keys(ICONS).map((file) => ({ file }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const icon = ICONS[(await params).file];
  if (!icon) return new Response("Not found", { status: 404 });
  const { size, maskable } = icon;
  return new ImageResponse(
    maskable ? <BrandIcon size={size} mark={0.5} square /> : <BrandIcon size={size} />,
    { width: size, height: size },
  );
}
