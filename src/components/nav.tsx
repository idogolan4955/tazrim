"use client";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type Role = "ADMIN" | "PARTNER";
interface NavUser {
  email?: string | null;
  name?: string | null;
  role?: Role;
}

const ADMIN_LINKS = [
  { href: "/", label: "סקירה" },
  { href: "/accounts", label: "חשבונות" },
  { href: "/recurring", label: "פעולות חוזרות" },
  { href: "/future", label: "פעולות עתידיות" },
  { href: "/loans", label: "הלוואות" },
  { href: "/sales", label: "מכירות" },
  { href: "/purchasing", label: "רכש חזוי" },
  { href: "/status", label: "סטטוס ומאזן" },
  { href: "/report", label: "דוח תשקיף" },
  { href: "/log", label: "יומן" },
];

const PARTNER_LINKS = [
  { href: "/", label: "סקירה" },
  { href: "/report", label: "דוח תשקיף" },
];

export function Nav({ user }: { user: NavUser }) {
  const pathname = usePathname();
  const links = user.role === "PARTNER" ? PARTNER_LINKS : ADMIN_LINKS;
  return (
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-20">
      <div className="max-w-7xl mx-auto px-4 md:px-6 flex items-center justify-between h-14">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-bold text-lg text-brand-700">תזרים</Link>
          <ul className="hidden md:flex gap-1">
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-sm",
                    pathname === l.href ? "bg-brand-50 text-brand-700 font-semibold" : "text-slate-600 hover:bg-slate-50",
                  )}
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-500 hidden sm:inline">{user.name ?? user.email}</span>
          <span className="chip-slate">{user.role === "PARTNER" ? "שותף" : "מנהל"}</span>
          <button className="btn" onClick={() => signOut({ callbackUrl: "/login" })}>
            התנתקות
          </button>
        </div>
      </div>
      <div className="md:hidden border-t border-slate-100 overflow-x-auto">
        <ul className="flex gap-1 px-2 py-2">
          {links.map((l) => (
            <li key={l.href} className="shrink-0">
              <Link
                href={l.href}
                className={cn(
                  "px-3 py-1.5 rounded-md text-sm",
                  pathname === l.href ? "bg-brand-50 text-brand-700 font-semibold" : "text-slate-600",
                )}
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
