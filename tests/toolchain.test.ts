import { it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The Node version lives in the Dockerfile's FROM lines (Dependabot bumps them) and npm's in
// package.json's packageManager; CI's setup action reads both from there.
const dockerfile = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

it("uses one Node version in every Dockerfile stage, on Node 22", () => {
  const versions = [...dockerfile.matchAll(/^FROM node:(\d+\.\d+\.\d+)(?![\d.])/gm)].map(
    (m) => m[1],
  );
  assert.ok(versions.length >= 2, "expected the dependencies and production stages");
  assert.equal(new Set(versions).size, 1, `Dockerfile stages differ: ${versions.join(", ")}`);
  assert.match(versions[0], /^22\.\d+\.\d+$/);
  assert.equal(
    pkg.engines?.node?.includes("22"),
    true,
    "package.json engines should allow Node 22",
  );
});

it("runs the test stack's fake Google on the app's Node version", () => {
  const compose = readFileSync(new URL("../compose.test.yaml", import.meta.url), "utf8");
  const node = dockerfile.match(/^FROM node:(\d+\.\d+\.\d+)(?![\d.])/m)?.[1];
  assert.ok(node);
  assert.ok(compose.includes(`image: node:${node}-`), `compose.test.yaml should use node:${node}`);
});

it("pins npm only in package.json", () => {
  assert.match(pkg.packageManager, /^npm@\d+\.\d+\.\d+$/);
  assert.doesNotMatch(dockerfile, /npm@\d/, "the Dockerfile should read packageManager instead");
});
