import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BookMark } from "../../lib/brand";
import { privacyReady } from "../../lib/admin/privacy";
import { readPrivacy } from "../../lib/server/site-settings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Privacy and cookies · vocabulary.training",
  description: "Who runs this site, what it stores, and the one cookie it uses.",
};

// Keep this page in step with what the app stores and sends (docs/architecture.md,
// docs/ai-features.md).
export default async function PrivacyPage() {
  const privacy = await readPrivacy();
  const ready = privacyReady(privacy);
  return (
    <main className="auth-screen">
      <article className="auth-content privacy-page">
        <Link href="/" className="auth-brand">
          <BookMark aria-hidden="true" size={28} />
          <span>
            vocabulary<strong>.training</strong>
          </span>
        </Link>
        <h1>Privacy and cookies</h1>
        <p>One essential sign-in cookie. No analytics, advertising or tracking.</p>

        <h2>Who is responsible</h2>
        {ready ? (
          <p>
            {privacy.controllerName}
            <br />
            Privacy contact: <a href={`mailto:${privacy.contactEmail}`}>{privacy.contactEmail}</a>
          </p>
        ) : (
          <p className="error">
            The site owner hasn&apos;t published a privacy contact yet, so registration is closed.
          </p>
        )}

        <h2>What is stored</h2>
        <ul>
          <li>
            Your email address and a hash of your password. The password itself is never stored.
          </li>
          <li>
            Your word lists, your profile languages, your answers with their review state, and your
            newest 200 completed practice sessions.
          </li>
          <li>
            Sign-in sessions, stored only as hashes of their tokens. Sign-in attempt limits use
            hashed identifiers, never your email address or IP address.
          </li>
        </ul>
        <p>
          This is used only to provide the service you sign up for: signing in, keeping your lists
          and scheduling your practice. Creating an account requests that service; it isn&apos;t
          consent to tracking or marketing.
        </p>

        <h2>AI features</h2>
        <p>
          If this site has language notes or word audio turned on, the text a request needs is sent
          through Requesty, an AI gateway, to the AI provider that runs the model. For a language
          note, that is the word, its accepted answers, your answer and the language names. For
          audio, it is only the word you clicked. Your email address and account are never sent.
          Audio is kept in the server&apos;s memory for up to an hour and never written to disk.
        </p>

        <h2>The cookie</h2>
        <p>
          <code>vocabulary_session</code> keeps you signed in. It can&apos;t be read by scripts, is
          only sent to this site, and expires after 14 days or when you sign out. Nothing else is
          stored in your browser, so there is nothing to accept.
        </p>

        <h2>How long, and your rights</h2>
        <p>
          Your account and data are kept until you ask for them to be deleted. You can ask the
          privacy contact above for a copy of your data, a correction, or deletion, and complain to
          your data protection authority (in Sweden, IMY). You can export any word list as CSV
          yourself. The hosting provider may keep technical logs, such as IP addresses, for
          security.
        </p>

        <Link href="/" className="text-button">
          <ArrowLeft size={15} /> Back to vocabulary.training
        </Link>
      </article>
    </main>
  );
}
