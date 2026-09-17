import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import { ThemeProvider } from "@/components/theme-provider";
import { UploadBudget } from "@/components/upload-budget";
import { metadataBaseUrl } from "@/lib/site-url";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: metadataBaseUrl(),
  title: {
    default: "Swift Cargo — Sea freight from China to Tanzania",
    template: "%s · Swift Cargo",
  },
  description:
    "Loose cargo and full container sea freight from Guangzhou to Dar es Salaam. Track your cargo, calculate CBM and see live shipping rates.",
  /* Served from public/ rather than the app/icon file convention: middleware
     treats every path beginning "/app" as the staff area, so app/apple-icon.png
     would send a phone asking for the icon to the sign-in page. */
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/brand/icon.png", type: "image/png", sizes: "512x512" },
    ],
    apple: "/brand/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0e4c87",
  width: "device-width",
  initialScale: 1,
};

/**
 * The most file bytes one form may post. Vercel refuses a function request over
 * 4.5 MB before the app runs, so there the budget leaves room for the other
 * fields and the multipart framing. Elsewhere it sits under the server action
 * body limit in next.config.mjs.
 */
const UPLOAD_REQUEST_BUDGET = process.env.VERCEL ? 4_000_000 : 15_000_000;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans`}>
        <ThemeProvider>{children}</ThemeProvider>
        <UploadBudget limitBytes={UPLOAD_REQUEST_BUDGET} />
      </body>
    </html>
  );
}
