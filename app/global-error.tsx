"use client";

import { useEffect } from "react";

import { t } from "@/lib/i18n";

/**
 * The last boundary: the root layout itself failed, so there is no theme, no
 * font and no shell — only inline styles are certain to render. The error's
 * message stays in the console; the reader gets the digest the log is keyed by.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Root error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: 16,
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#f5f8fb",
          color: "#10202f",
        }}
      >
        <div role="alert" style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: 22, margin: "0 0 12px" }}>
            {t(null, "Something went wrong")}
          </h1>
          <p style={{ fontSize: 14, color: "#51606e", margin: 0 }}>
            {t(null, "Try again in a moment. If it keeps happening, quote this reference.")}
          </p>
          {error.digest ? (
            <p style={{ fontFamily: "monospace", fontSize: 12, color: "#51606e" }}>{error.digest}</p>
          ) : null}
          <div style={{ marginTop: 20, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={reset}
              style={{ height: 40, padding: "0 16px", borderRadius: 6, border: 0, background: "#0e4c87", color: "#fff", fontSize: 14, cursor: "pointer" }}
            >
              {t(null, "Try again")}
            </button>
            <a
              href="/"
              style={{ height: 40, lineHeight: "40px", padding: "0 16px", borderRadius: 6, border: "1px solid #cfd8e0", color: "#10202f", fontSize: 14, textDecoration: "none" }}
            >
              {t(null, "Home")}
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
