"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { cn } from "@/lib/utils";

import { Tx } from "@/components/app/tx";
/**
 * THE ADDRESS, READY TO FORWARD.
 *
 * Shown as it will arrive — in Chinese, one fact per line — with one press to
 * copy the whole message for WhatsApp or WeChat. A copied block the supplier
 * can read at a glance is a delivery that reaches the right door with the
 * right mark on the boxes.
 */
export function SupplierAddressCard({
  text,
  lines,
  english,
  dark,
}: {
  text: string;
  lines: { label: string; value: string }[];
  english: string | null;
  dark?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className={cn("overflow-hidden rounded-2xl border", dark ? "border-white/20 bg-white text-slate-900" : "bg-card")}>
      <div className="flex items-center justify-between gap-3 border-b bg-[#0b2742] px-4 py-2.5 text-white">
        <p className="text-sm font-bold">【Swift Cargo 广州仓库】</p>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            } catch {
              /* The text stays selectable below, which always works. */
            }
          }}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#f4611f] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#dc4e12]"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copied · 已复制" : "Copy for supplier · 复制"}
        </button>
      </div>
      <dl className="space-y-1.5 px-4 py-3 text-sm">
        {lines.map((line) => (
          <div key={line.label} className="grid grid-cols-[6.5rem_1fr] gap-2">
            <dt className="font-semibold text-slate-500"><Tx>{line.label}</Tx>：</dt>
            <dd className="font-medium">{line.value}</dd>
          </div>
        ))}
      </dl>
      <p className="border-t px-4 py-2 text-xs text-slate-500">
        温馨提示：请在每一箱货物的外箱上写清楚唛头，送货前请先电话联系仓库。
        {english ? <span className="mt-1 block">English: {english}</span> : null}
      </p>
    </div>
  );
}
