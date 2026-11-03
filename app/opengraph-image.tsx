import { ImageResponse } from "next/og";
import { BRAND_BLUE, BOOK_PATHS } from "../lib/brand";
import { SITE_TAGLINE } from "../lib/site";

// The share preview for every page; X/Twitter falls back to it (summary_large_image).
export const alt = `vocabulary.training: ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "0 96px",
        background: BRAND_BLUE,
        color: "#fff",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
        <svg
          width={128}
          height={128}
          viewBox="0 0 24 24"
          fill="none"
          stroke="#fff"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {BOOK_PATHS.map((d) => (
            <path key={d} d={d} />
          ))}
        </svg>
        <div style={{ display: "flex", fontSize: 92, letterSpacing: -2 }}>
          <span>vocabulary</span>
          <span style={{ color: "#bcd4f2" }}>.training</span>
        </div>
      </div>
      <div style={{ display: "flex", marginTop: 48, fontSize: 44, color: "#dce8f7" }}>
        {SITE_TAGLINE}
      </div>
    </div>,
    size,
  );
}
