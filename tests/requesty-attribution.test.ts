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
  assert.match(html, /opens in a new tab/);
});

test("Requesty attribution uses a local logo, honest AI copy and a visible referral disclosure", () => {
  const html = renderToStaticMarkup(createElement(RequestyAttribution));
  assert.match(html, /src="\.\/requesty-logo\.png"/);
  assert.match(html, /alt="Requesty"/);
  assert.match(html, /width="112" height="25"/);
  assert.match(html, /Understand the mistake\. Learn the word\./);
  assert.match(html, /Referral link\. Signups may earn us AI credits\./);
  assert.doesNotMatch(html, /<script|router\.requesty\.ai|AI grading/);
});
