// Regenerate app/favicon.ico from the brand mark: npx tsx scripts/generate-favicon.tsx
// Writes an ICO with 16/32/48 px PNG frames (supported by all current browsers and Windows).
import { writeFile } from "node:fs/promises";
import { ImageResponse } from "next/og";
import { BrandIcon } from "../lib/brand";

const sizes = [16, 32, 48];
const frames = await Promise.all(
  sizes.map(async (size) => {
    // A larger mark keeps the book legible at 16 px.
    const image = new ImageResponse(<BrandIcon size={size} mark={0.82} />, {
      width: size,
      height: size,
    });
    return Buffer.from(await image.arrayBuffer());
  }),
);

const header = Buffer.alloc(6 + 16 * frames.length);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(frames.length, 4);
let offset = header.length;
frames.forEach((png, i) => {
  const entry = 6 + 16 * i;
  header.writeUInt8(sizes[i], entry); // width
  header.writeUInt8(sizes[i], entry + 1); // height
  header.writeUInt16LE(1, entry + 4); // colour planes
  header.writeUInt16LE(32, entry + 6); // bits per pixel
  header.writeUInt32LE(png.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += png.length;
});

await writeFile(new URL("../app/favicon.ico", import.meta.url), Buffer.concat([header, ...frames]));
console.log(`Wrote app/favicon.ico (${sizes.join(", ")} px)`);
