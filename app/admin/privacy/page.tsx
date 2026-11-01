import PrivacySettings from "../../../components/admin/PrivacySettings";
import { adminPage } from "../../../lib/server/auth";

export default async function PrivacySettingsPage() {
  await adminPage();
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>Privacy</h1>
          <p>
            Who runs this site and how to reach them about personal data, shown on the public{" "}
            <a href="/privacy">privacy page</a>. Registration stays closed until both are set.
          </p>
        </div>
      </header>
      <PrivacySettings />
    </>
  );
}
