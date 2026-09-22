"use client";

import { useEffect } from "react";
import { Printer } from "lucide-react";

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
