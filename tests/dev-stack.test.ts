import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the dev stack leaves NODE_ENV to Next, so npm run build works in the container", () => {
  assert.doesNotMatch(read("compose.dev.yaml"), /^\s*-?\s*NODE_ENV\s*[=:]/m);
});

test("the dev server polls for changes, which only webpack does in a container", () => {
  // Turbopack ignores WATCHPACK_POLLING and misses edits made on a Windows drive.
  assert.match(read("compose.dev.yaml"), /WATCHPACK_POLLING: \$\{WATCHPACK_POLLING:-true\}/);
  assert.match(JSON.parse(read("package.json")).scripts.dev, /^next dev --webpack /);
});

test("the dev container starts the server only after a successful reinstall", () => {
  assert.match(read(".devcontainer/compose.yaml"), /\}; \} &&\s*exec npm run dev/);
});

test("fonts are served from this site: nothing loads from Google Fonts", () => {
  for (const path of ["app/style.css", "app/layout.tsx", "next.config.ts"])
    assert.doesNotMatch(read(path), /fonts\.(googleapis|gstatic)\.com/, path);
  assert.match(read("next.config.ts"), /font-src 'self';/);
});
