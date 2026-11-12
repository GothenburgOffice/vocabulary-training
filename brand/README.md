# vocabulary.training logo set

The masters for the logo, icons and share image. Every file uses filled paths only, with no
strokes, text, raster images or fonts. The wordmarks are outlined Instrument Sans (OFL):
"vocabulary" in Regular, ".training" in Bold.

| Colour                | Light     | Dark      |
| --------------------- | --------- | --------- |
| Mark and ".training"  | `#1765bf` | `#5a9cec` |
| "vocabulary" and text | `#202e40` | `#f6f7f9` |
| Background            | `#f6f7f9` | `#0a0c10` |

The dark files (`*-dark.svg`) are generated from the light ones by
`scripts/brand-assets.mjs`; edit only the light masters.

| File                    | Use                                                                    |
| ----------------------- | ---------------------------------------------------------------------- |
| `mark.svg`              | The book mark, 48 px and up                                            |
| `mark-small.svg`        | Heavier, simplified mark for 16–47 px (favicon, sidebar)               |
| `app-icon.svg`          | 1024 px full-bleed icon with square corners (iOS and Android round it) |
| `app-icon-maskable.svg` | The mark inside the central 80% circle (Android maskable icon)         |
| `wordmark-1line.svg`    | Mark beside "vocabulary.training" on one line                          |
| `wordmark-2line.svg`    | Mark beside "vocabulary" / ".training" on two lines                    |
| `og-image.svg`          | 1200×630 share image, with its content inside the central 1000×500     |

Keep clear space of at least a quarter of the mark's height around it.

## Where they are used

`node scripts/brand-assets.mjs` regenerates everything derived from these files: the dark
variants, `app/icon.svg` and `app/favicon.ico` (the small mark on a blue tile),
`app/apple-icon.png`, `public/icons/*.png` (web manifest) and `app/opengraph-image.png`.
In the dev container, run it under Xvfb with `HEADED=1`, because headless Chromium never
paints there. The in-app mark is `BookMark` in `lib/brand.tsx`; `tests/app-icons.test.ts`
checks that its paths match these files.

## License

The artwork is not under the repository's MIT license: see [LICENSE.md](LICENSE.md).
