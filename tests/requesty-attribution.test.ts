import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import RequestyAttribution from "../components/RequestyAttribution";

test("Requesty attribution preserves the referral destination and safe external-link behavior", () => {
  const html = renderToStaticMarkup(createElement(RequestyAttribution));
  assert.match(html, /href="https:\/\/app\.requesty\.ai\/join\?ref=b1f2b1e1"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="sponsored noopener noreferrer"/);
  assert.match(html, /referrerPolicy="no-referrer"/i);
  assert.match(html, /[Oo]pens in a new tab/);
});

test("Requesty attribution uses a local logo and a visible referral disclosure", () => {
  const html = renderToStaticMarkup(createElement(RequestyAttribution));
  assert.match(html, /src="\.\/requesty-logo\.png"/);
  assert.match(html, /alt="Requesty"/);
  assert.match(html, />AI features by</);
  // Marked as a referral where it is shown, and in full in its label and tooltip.
  assert.match(html, /<small>Referral link<\/small>/);
  assert.match(html, /aria-label="[^"]*Referral link: signups may earn us AI credits\./);
  assert.match(html, /title="Referral link: signups may earn us AI credits\."/);
  assert.doesNotMatch(html, /<script|router\.requesty\.ai|AI grading/);
});
