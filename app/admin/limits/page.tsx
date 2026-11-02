import LimitsSettings from "../../../components/admin/LimitsSettings";
import { adminPage } from "../../../lib/server/auth";

export default async function LimitsPage() {
  await adminPage();
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>Limits</h1>
          <p>
            How much each account may use speech and language notes. Letters are the characters sent
            to the AI provider; cached audio replays are free. Changes apply to the next AI call.
          </p>
        </div>
      </header>
      <LimitsSettings />
    </>
  );
}
