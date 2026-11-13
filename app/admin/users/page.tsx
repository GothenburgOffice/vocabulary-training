import Users from "@/components/admin/Users";
import { adminPage } from "@/lib/server/auth";

export default async function UsersPage() {
  await adminPage();
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>Users</h1>
          <p>
            Accounts, account types and AI usage. An account moved to the trash is locked at once
            and deleted with its data 30 days later.
          </p>
        </div>
      </header>
      <Users />
    </>
  );
}
