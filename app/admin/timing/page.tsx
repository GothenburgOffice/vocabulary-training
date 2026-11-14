import TimingSettings from "@/components/admin/TimingSettings";
import { adminPage } from "@/lib/server/auth";

export default async function TimingSettingsPage() {
  await adminPage();
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>Answer timing</h1>
          <p>
            How long learners hesitate on right answers, collected to calibrate a future Hard grade.
            It doesn&apos;t change any grade or review date yet.
          </p>
        </div>
      </header>
      <TimingSettings />
    </>
  );
}
