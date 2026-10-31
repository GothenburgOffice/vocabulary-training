import { ExternalLink } from "lucide-react";

export default function RequestyAttribution() {
  return <div className="requesty-attribution">
    <a className="requesty-link" href="https://app.requesty.ai/join?ref=b1f2b1e1"
      target="_blank" rel="sponsored noopener noreferrer" referrerPolicy="no-referrer"
      aria-label="AI feedback powered by Requesty. Referral link, opens in a new tab.">
      <span>AI feedback by</span>
      {/* Self-hosted official wordmark: no third-party tracking or image request. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="./requesty-logo.png" alt="Requesty" width="112" height="25" />
      <ExternalLink size={13} aria-hidden="true" />
    </a>
    <span className="requesty-tagline">Understand the mistake. Learn the word.</span>
    <small>Referral link. Signups may earn us AI credits.</small>
  </div>;
}
