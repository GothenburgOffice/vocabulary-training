import Users from "../../../components/admin/Users";
import { adminPage } from "../../../lib/server/auth";

export default async function UsersPage() {
  await adminPage();
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>Users</h1>
          <p>
            Accounts, account types and AI usage. Deleting an account permanently deletes its data.
          </p>
        </div>
      </header>
      <Users />
    </>
  );
}
