import AiSettings from "../../../components/admin/AiSettings";
import { adminPage } from "../../../lib/server/auth";

// The Requesty keys and language-note models per tier. Speech models are set per language
// (Admin → Languages), and the usage limits per account in Admin → Limits.
export default async function AiSettingsPage() {
  await adminPage();
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>AI settings</h1>
          <p>
            Requesty keys and the language-note model per tier, and Requesty usage. Speech is set
            per language, and usage limits under Limits. Changes apply to the next AI call.
          </p>
        </div>
      </header>
      <AiSettings />
    </>
  );
}
