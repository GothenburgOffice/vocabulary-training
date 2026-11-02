// Shown at the bottom of the sidebar while an AI feature is on. The link can earn us credits,
// so it is marked as a referral where it is shown (marketing rules ask for paid links to be
// recognisable as such), not only in its label.
export default function RequestyAttribution() {
  return (
    <div className="requesty-attribution">
      <a
        className="requesty-link"
        href="https://app.requesty.ai/join?ref=b1f2b1e1"
        target="_blank"
        rel="sponsored noopener noreferrer"
        referrerPolicy="no-referrer"
        aria-label="AI features by Requesty. Referral link: signups may earn us AI credits. Opens in a new tab."
        title="Referral link: signups may earn us AI credits."
      >
        <span>AI features by</span>
        {/* Self-hosted official wordmark: no third-party tracking or image request. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="./requesty-logo.png" alt="Requesty" width="85" height="19" />
      </a>
      <small>Referral link</small>
    </div>
  );
}
