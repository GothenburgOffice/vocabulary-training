import ReportsPanel from "../../../components/admin/ReportsPanel";
import { adminPage } from "../../../lib/server/auth";

export default async function ReportsPage() {
  await adminPage();
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>Reports</h1>
          <p>
            Issues learners reported with speech and language notes. Use the language, model and
            voice to investigate settings in Languages or AI settings.
          </p>
        </div>
      </header>
      <ReportsPanel />
    </>
  );
}
