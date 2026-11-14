import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BookMark } from "@/lib/brand";
import { privacyReady } from "@/lib/admin/registration";
import { readPrivacy } from "@/lib/server/site-settings";
import { SHARE_IMAGE, SITE_NAME, openGraph } from "@/lib/site";

export const dynamic = "force-dynamic";
const TITLE = "Privacy and cookies";
const DESCRIPTION = "Who runs this site, what it stores, and the one cookie it uses.";
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: openGraph("/privacy", `${TITLE} · ${SITE_NAME}`, DESCRIPTION),
  twitter: {
    card: "summary_large_image",
    title: `${TITLE} · ${SITE_NAME}`,
    description: DESCRIPTION,
    images: [SHARE_IMAGE],
  },
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
        <p>
          One essential sign-in cookie, and your practice settings in your browser. No analytics,
          advertising or tracking.
        </p>

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
            Your word lists, your profile languages and appearance (light, dark or your
            device&apos;s setting), and your newest 200 completed practice sessions.
          </li>
          <li>
            How you practise: each answer, whether it was right and when, the review schedule worked
            out from your answers, and measurements of how you answer, such as how long you usually
            hesitate. They are used only to schedule and grade your practice and to tune how that
            works.
          </li>
          <li>
            AI usage: for each language note and audio request that reaches the AI provider, how
            many letters it sent and when, kept for 90 days to limit misuse. Not the text itself.
            The site administrator can review these counts by account to operate the service and
            investigate misuse.
          </li>
          <li>
            Reports of a wrong AI result, if you send one: the result (the word, its language, the
            model and voice, and the request that was sent), the reason you chose, your account type
            and the date. They are stored without your account, and with dates rather than times.
            Administrators can delete reports older than 15 days.
          </li>
          <li>
            Sign-in sessions, stored only as hashes of their tokens. The time of your last
            successful sign-in is kept with your account so the administrator can manage accounts;
            it is deleted with your account. Sign-in attempt limits use hashed identifiers, never
            your email address or IP address.
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
          audio, it is only the word you clicked, or a word&apos;s accepted answers. Your email
          address and account are never sent. Audio is kept in the server&apos;s memory for up to an
          hour and never written to disk.
        </p>
        <p>
          You can turn AI features off in your profile (Use AI features). Then nothing of yours is
          sent to an AI provider, including by AI features added later, until you turn them on
          again. The setting is kept with your account.
        </p>
        <p>
          The page keeps your last 20 AI results in memory so you can report one; reloading or
          signing out clears them. Reports are never sent to the AI provider.
        </p>

        <h2>The cookie and your browser</h2>
        <p>
          <code>vocabulary_session</code> keeps you signed in. It can&apos;t be read by scripts, is
          only sent to this site, and expires after 14 days or when you sign out.
        </p>
        <p>
          Your practice settings (direction, practice mode, session size, case and accents) are
          remembered in your browser&apos;s local storage, so they stay as you set them. They are
          never sent to the server or anyone else. Clearing this site&apos;s data resets them to the
          defaults.
        </p>
        <p>
          Both are needed for what you ask the site to do, so there is nothing to accept. Nothing
          else is stored in your browser.
        </p>

        <h2>How long, and your rights</h2>
        <p>
          Your account and data are kept until you ask for them to be deleted. A deleted account is
          locked at once, and it and all its data are erased after 30 days. You can ask the privacy
          contact above for a copy of your data, a correction, or deletion, and complain to your
          data protection authority (in Sweden, IMY). You can download all your data as one JSON
          file from your account (Export my data), export any word list as CSV, and delete a word
          list with its words and review history at once; completed sessions keep the words they
          practised. The hosting provider may keep technical logs, such as IP addresses, for
          security.
        </p>

        <Link href="/" className="text-button">
          <ArrowLeft size={15} /> Back to vocabulary.training
        </Link>
      </article>
    </main>
  );
}
