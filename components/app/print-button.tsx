"use client";

import { useEffect } from "react";
import { Download, Printer } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function PrintButton({
  label = "Print",
  className,
  primary,
}: {
  label?: string;
  className?: string;
  primary?: boolean;
}) {
  return (
    <Button
      variant={primary ? "default" : "outline"}
      onClick={() => window.print()}
      className={cn("print:hidden", className)}
    >
      <Printer />
      {label}
    </Button>
  );
}

/**
 * SAVE THIS SHEET AS A PDF.
 *
 * The document on screen IS the document — an A4 sheet with the company's
 * letterhead, laid out for paper — so saving it is the browser's own print
 * dialog with "Save as PDF" chosen, opened on a copy of the page that asks for
 * it. One design per document: a second, hand-built PDF of the same note would
 * drift from this one the first time either changed.
 *
 * The file is named after the page title, which already carries the document's
 * number.
 */
export function DownloadSheetButton({
  label = "Download PDF",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <Button
      variant="outline"
      onClick={() => {
        const url = new URL(window.location.href);
        url.searchParams.set("download", "1");
        window.open(url.toString(), "_blank", "noopener");
      }}
      className={cn("print:hidden", className)}
    >
      <Download />
      {label}
    </Button>
  );
}

/**
 * Opens the save dialog on arrival when the page was asked for as a download.
 *
 * The browser names the PDF after the page title, which already carries the
 * invoice number and the customer. Waits for the page to finish loading, or the
 * logo prints as an empty box.
 */
export function AutoPrint() {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("download") !== "1") return;
    const go = () => setTimeout(() => window.print(), 300);
    if (document.readyState === "complete") go();
    else window.addEventListener("load", go, { once: true });
  }, []);
  return null;
}
