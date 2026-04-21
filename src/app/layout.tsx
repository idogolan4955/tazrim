import "./globals.css";
import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Nav } from "@/components/nav";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: {
    default: "תזרים",
    template: "%s · תזרים",
  },
  description: "ניהול תזרים מזומנים ותחזיות עסקיות",
};

export const viewport = {
  themeColor: "#1f4df5",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  return (
    <html lang="he" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        <Providers>
          <div className="min-h-screen flex flex-col">
            {session?.user ? <Nav user={session.user} /> : null}
            <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
