"use client";

import { Plus } from "lucide-react";

import { openRecordPayment } from "@/components/app/record-payment-dialog";
import { Button } from "@/components/ui/button";

/**
 * A button that opens the one Record Payment dialog in the app frame, over
 * whatever screen it was pressed on. It holds no data of its own.
 */
export function RecordPaymentButton({
  compact = false,
  primary = false,
}: {
  compact?: boolean;
  primary?: boolean;
}) {
  return (
    <Button
      type="button"
      variant={primary ? "default" : "outline"}
      size="sm"
      onClick={() => openRecordPayment()}
    >
      <Plus />
      {compact ? "Payment" : "Record Payment"}
    </Button>
  );
}
