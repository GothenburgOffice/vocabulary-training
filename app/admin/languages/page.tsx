import LanguageSettings from "../../../components/admin/LanguageSettings";
import { adminPage } from "../../../lib/server/auth";

export default async function LanguagesPage() {
  await adminPage();
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>Languages</h1>
          <p>
            The languages offered in the app, their CSV codes and speech settings. A language
            without a speech model gets no speech buttons.
          </p>
        </div>
      </header>
      <LanguageSettings />
    </>
  );
}
