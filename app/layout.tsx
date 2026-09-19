import type { Metadata, Viewport } from "next";
import { Archivo, Inter } from "next/font/google";

import { InstallApp } from "@/components/install-app";
import { ThemeProvider } from "@/components/theme-provider";
import { UploadBudget } from "@/components/upload-budget";
import { metadataBaseUrl } from "@/lib/site-url";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

/* The public site's headlines. Inter carries every figure and every form; a
   display face is only for the few words a visitor reads first. */
const display = Archivo({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["600", "700", "800"],
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
  /* Opened from the home screen, it runs full screen like an installed app:
     the status bar sits over the app's own navy header rather than a white
     browser strip. */
  appleWebApp: {
    capable: true,
    title: "Swift Cargo",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1320" },
  ],
  width: "device-width",
  initialScale: 1,
  /* Draw under the notch and the home bar; every fixed bar pads itself with
     the safe-area insets so nothing ends up behind them. */
  viewportFit: "cover",
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
      <body className={`${inter.variable} ${display.variable} font-sans`}>
        <ThemeProvider>{children}</ThemeProvider>
        <UploadBudget limitBytes={UPLOAD_REQUEST_BUDGET} />
        <InstallApp />
      </body>
    </html>
  );
}
