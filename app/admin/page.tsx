import Link from "next/link";
import { ADMIN_SECTIONS } from "../../lib/admin/sections";
import { adminPage } from "../../lib/server/auth";
import { db } from "../../lib/server/db";

export default async function AdminOverview() {
  await adminPage();
  const { rows } = await db.query(
    "SELECT count(*)::int AS accounts, count(*) FILTER (WHERE is_admin)::int AS admins FROM users",
  );
  const sections = ADMIN_SECTIONS.filter((section) => section.href !== "/admin");
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>Overview</h1>
          <p>Accounts on this server.</p>
        </div>
      </header>
      <div className="admin-stats">
        <div>
          <span>Accounts</span>
          <strong>{rows[0].accounts}</strong>
        </div>
        <div>
          <span>Admins</span>
          <strong>{rows[0].admins}</strong>
        </div>
      </div>
      {sections.length > 0 && (
        <ul className="admin-sections">
          {sections.map((section) => (
            <li key={section.href}>
              <Link href={section.href}>
                <strong>{section.title}</strong>
                <span>{section.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
