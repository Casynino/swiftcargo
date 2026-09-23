"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { WhatsAppButton } from "@/components/app/whatsapp-button";
import { getMergedNotifyMessage } from "@/lib/actions/merged-payment";

/**
 * ONE MERGED PAYMENT, ONE NOTIFY BUTTON.
 *
 * The message has to exist before WhatsApp can be opened with it already
 * typed — see `WhatsAppButton` — so it is fetched the moment this mounts
 * (right after the merge succeeds) rather than composed on the click itself.
 */
export function MergedNotifyButton({ transactionRef }: { transactionRef: string }) {
  const [data, setData] = useState<
    { message: string; phone: string | null; invoiceId: string } | null | "error"
  >(null);

  useEffect(() => {
    let cancelled = false;
    getMergedNotifyMessage(transactionRef).then((result) => {
      if (cancelled) return;
      setData(result.ok ? result : "error");
    });
    return () => {
      cancelled = true;
    };
  }, [transactionRef]);

  if (data === "error") return null;
  if (!data) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Preparing the notification…
      </span>
    );
  }

  return (
    <WhatsAppButton
      invoiceId={data.invoiceId}
      phone={data.phone}
      message={data.message}
      kind="general"
      label="Notify customer"
    />
  );
}
