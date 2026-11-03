import AiSettings from "../../../components/admin/AiSettings";
import LimitsSettings from "../../../components/admin/LimitsSettings";
import { adminPage } from "../../../lib/server/auth";

// Everything that decides what the AI features cost and who may use them: the Requesty keys
// and language-note models per tier, then the usage limits per account. Speech models are set
// per language (Admin → Languages).
export default async function AiSettingsPage() {
  await adminPage();
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>AI settings</h1>
          <p>
            Requesty keys, the language-note model per tier, and how much each account may use the
            AI features. Speech is set per language. Changes apply to the next AI call.
          </p>
        </div>
      </header>
      <section aria-labelledby="ai-keys">
        <h2 id="ai-keys" className="admin-subheading">
          Keys and models
        </h2>
        <AiSettings />
      </section>
      <section aria-labelledby="ai-limits">
        <h2 id="ai-limits" className="admin-subheading">
          Limits
        </h2>
        <p className="field-help">
          Letters are the characters sent to the AI provider; cached audio replays are free. A
          letter limit of 0 means no limit, for a site that caps spending only in Requesty.
        </p>
        <LimitsSettings />
      </section>
    </>
  );
}
