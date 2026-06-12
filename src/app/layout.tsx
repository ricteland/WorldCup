import type { Metadata, Viewport } from "next";
import { Geist, Space_Grotesk } from "next/font/google";
import { FlagPolyfill } from "@/components/FlagPolyfill";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const display = Space_Grotesk({
  variable: "--font-display-var",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VAMOS2026",
  description: "The 2026 World Cup, predicted with friends. ¡Vamos!",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/assets/icon-192.png", apple: "/assets/icon-192.png" },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "VAMOS2026" },
};

export const viewport: Viewport = {
  themeColor: "#060a13",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <FlagPolyfill />
        {children}
      </body>
    </html>
  );
}
