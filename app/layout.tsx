import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { ThemeProvider } from "@/components/ThemeProvider";
import { earlyAppearanceScript } from "@/lib/backgrounds";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Linkdeck",
  description: "Your bookmarks, one new tab away",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // Start with dark + Aurora; the inline script applies saved settings before
    // the first paint, and ThemeProvider keeps them in sync afterwards.
    <html lang="en" className="dark bg-aurora" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: earlyAppearanceScript() }} />
      </head>
      <body className={inter.className}>
        <ThemeProvider>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
