// Single source for the brand mark used by generated icons (keep app/icon.svg and --blue in sync).
export const BRAND_BLUE = "#1765bf";
// lucide BookOpen, the book mark beside the wordmark (24×24 viewBox).
export const BOOK_PATHS = [
  "M12 7v14",
  "M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z",
];

/** White book on a rounded brand-blue square, for next/og ImageResponse. */
export function BrandIcon({ size, mark = 0.62 }: { size: number; mark?: number }) {
  const markSize = Math.round(size * mark);
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BRAND_BLUE,
        borderRadius: Math.round(size * 0.2),
      }}
    >
      <svg
        width={markSize}
        height={markSize}
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
    </div>
  );
}
