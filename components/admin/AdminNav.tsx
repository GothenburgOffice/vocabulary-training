"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_SECTIONS } from "../../lib/admin/sections";

export default function AdminNav() {
  const path = usePathname();
  return (
    <nav className="admin-nav" aria-label="Admin sections">
      {ADMIN_SECTIONS.map((section) => (
        <Link
          key={section.href}
          href={section.href}
          aria-current={path === section.href ? "page" : undefined}
        >
          {section.title}
        </Link>
      ))}
    </nav>
  );
}
