import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "WareTrack 3D", template: "%s · WareTrack 3D" },
  description: "Interactive 3D warehouse management and logistics simulation platform.",
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = { themeColor: "#2563EB" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-canvas text-ink">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
