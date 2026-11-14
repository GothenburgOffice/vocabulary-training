import EmailSettings from "@/components/admin/EmailSettings";
import { adminPage } from "@/lib/server/auth";

export default async function EmailSettingsPage() {
  await adminPage();
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>Email</h1>
          <p>
            The SMTP server that sends sign-up and password reset mail, and a button to test it.
            Changes apply right away.
          </p>
        </div>
      </header>
      <div className="admin-grid">
        <EmailSettings />
      </div>
    </>
  );
}
