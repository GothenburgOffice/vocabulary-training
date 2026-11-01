import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import AdminNav from "../../components/admin/AdminNav";
import { BookMark } from "../../lib/brand";
import { adminPage } from "../../lib/server/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin · vocabulary.training", robots: "noindex" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await adminPage();
  return (
    <div className="admin">
      <header className="admin-header">
        <Link href="/admin" className="admin-brand">
          <BookMark size={22} aria-hidden="true" />
          <span>
            vocabulary.<strong>training</strong> admin
          </span>
        </Link>
        <AdminNav />
        <span className="admin-user" title={admin.email}>
          {admin.email}
        </span>
        <Link href="/" className="text-button">
          <ArrowLeft size={15} /> Back to app
        </Link>
      </header>
      <main className="admin-main">{children}</main>
    </div>
  );
}
