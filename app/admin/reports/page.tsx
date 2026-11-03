import Reports from "../../../components/admin/Reports";
import { adminPage } from "../../../lib/server/auth";

export default async function ReportsPage() {
  await adminPage();
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>Reports</h1>
          <p>
            AI results that learners reported: wrong pronunciation, language or accent, garbled
            audio, or a wrong language note. Each report keeps the request that was sent, as the
            learner&apos;s browser recorded it. Reports are anonymous: no account is stored.
          </p>
        </div>
      </header>
      <Reports />
    </>
  );
}
