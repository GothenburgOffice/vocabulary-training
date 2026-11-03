// The brand mark in code. The masters are brand/*.svg; keep these paths, app/icon.svg and
// --blue in sync with them (tests/app-icons.test.ts checks). Regenerate the derived icons and
// the share image with scripts/brand-assets.mjs.
export const BRAND_BLUE = "#1765bf";
// The book mark (brand/mark.svg), for 48 px and up.
export const MARK = {
  viewBox: "0 0 64 49",
  d: "M0 2A2 2 0 0 1 2 0H22A12.5 12.5 0 0 1 32 5A12.5 12.5 0 0 1 42 0H62A2 2 0 0 1 64 2V38A2 2 0 0 1 62 40H41A6.5 6.5 0 0 0 34.5 46.5A2.5 2.5 0 0 1 29.5 46.5A6.5 6.5 0 0 0 23 40H2A2 2 0 0 1 0 38ZM5 5H22A7.5 7.5 0 0 1 29.5 12.5V37.01A11.5 11.5 0 0 0 23 35H5ZM59 5H42A7.5 7.5 0 0 0 34.5 12.5V37.01A11.5 11.5 0 0 1 41 35H59ZM11.5 12H22.5A1.5 1.5 0 0 1 22.5 15H11.5A1.5 1.5 0 0 1 11.5 12ZM11.5 19H19.5A1.5 1.5 0 0 1 19.5 22H11.5A1.5 1.5 0 0 1 11.5 19ZM11.5 26H21.5A1.5 1.5 0 0 1 21.5 29H11.5A1.5 1.5 0 0 1 11.5 26ZM41.5 12H52.5A1.5 1.5 0 0 1 52.5 15H41.5A1.5 1.5 0 0 1 41.5 12ZM41.5 19H49.5A1.5 1.5 0 0 1 49.5 22H41.5A1.5 1.5 0 0 1 41.5 19ZM41.5 26H46.5A1.5 1.5 0 0 1 46.5 29H41.5A1.5 1.5 0 0 1 41.5 26Z",
};
// The heavier, simplified mark (brand/mark-small.svg), for 16–47 px: the page lines of the
// full mark merge at small sizes.
export const MARK_SMALL = {
  viewBox: "0 0 32 23",
  d: "M0 1A1 1 0 0 1 1 0H12A6 6 0 0 1 16 1.53A6 6 0 0 1 20 0H31A1 1 0 0 1 32 1V18A1 1 0 0 1 31 19H20A2 2 0 0 0 18 21A2 2 0 0 1 14 21A2 2 0 0 0 12 19H1A1 1 0 0 1 0 18ZM4 4H12A2 2 0 0 1 14 6V15.34A6 6 0 0 0 12 15H4ZM28 4H20A2 2 0 0 0 18 6V15.34A6 6 0 0 1 20 15H28Z",
};

/**
 * The book mark beside the wordmark, in currentColor. It fills the width of a size × size box
 * (centred vertically), so layouts sized for a square icon keep working.
 */
export function BookMark({
  size = 24,
  ...props
}: { size?: number } & React.SVGProps<SVGSVGElement>) {
  const mark = size >= 48 ? MARK : MARK_SMALL;
  return (
    <svg width={size} height={size} viewBox={mark.viewBox} fill="currentColor" {...props}>
      <path fillRule="evenodd" d={mark.d} />
    </svg>
  );
}
