import LimitsSettings from "../../../components/admin/LimitsSettings";
import WriteLimitsSettings from "../../../components/admin/WriteLimitsSettings";
import { adminPage } from "../../../lib/server/auth";

// Every limit per account: how much each may use the AI features, and how many changes it may
// save, which stops a script long before a person would notice.
export default async function LimitsPage() {
  await adminPage();
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>Limits</h1>
          <p>
            How much each account may use the AI features, and how many changes it may save. Changes
            apply right away.
          </p>
        </div>
      </header>
      <section aria-labelledby="ai-limits">
        <h2 id="ai-limits" className="admin-subheading">
          AI usage
        </h2>
        <p className="field-help">
          Letters are the characters sent to the AI provider; cached audio replays are free. A
          letter limit of 0 means no limit, for a site that caps spending only in Requesty.
        </p>
        <LimitsSettings />
      </section>
      <section aria-labelledby="write-limits">
        <h2 id="write-limits" className="admin-subheading">
          Saves
        </h2>
        <p className="field-help">
          Every request to save counts, refused ones too: answers, sessions, list edits, profile
          changes, reports and AI requests. The limit is there to stop a script filling the
          database, so keep it far above what a person can reach. An account over it gets an error
          and can retry later; Users shows when it last happened. 0 means no limit.
        </p>
        <WriteLimitsSettings />
      </section>
    </>
  );
}
