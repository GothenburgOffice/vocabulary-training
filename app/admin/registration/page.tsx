import GoogleSettings from "@/components/admin/GoogleSettings";
import RegistrationSettings from "@/components/admin/RegistrationSettings";
import { adminPage } from "@/lib/server/auth";

export default async function RegistrationSettingsPage() {
  await adminPage();
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>Registration</h1>
          <p>
            Whether new accounts can be created, the privacy details that must be published first,
            and Google sign-in. Changes apply right away.
          </p>
        </div>
      </header>
      <div className="admin-grid">
        <RegistrationSettings />
        <GoogleSettings />
      </div>
    </>
  );
}
