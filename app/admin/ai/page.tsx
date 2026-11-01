import AiSettings from "../../../components/admin/AiSettings";
import { adminPage } from "../../../lib/server/auth";

export default async function AiSettingsPage() {
  await adminPage();
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>AI settings</h1>
          <p>
            Requesty keys and the language-note model per tier. Speech is set per language. Changes
            apply right away.
          </p>
        </div>
      </header>
      <AiSettings />
    </>
  );
}
