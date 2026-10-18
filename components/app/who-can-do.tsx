"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";

import { useT } from "@/components/app/locale-provider";

/**
 * "Can this person do that?" — answered from the same permission table the
 * server enforces, so the answer here is the answer the system will give.
 */
export function WhoCanDo({
  people,
  grants,
  permissions,
}: {
  people: { id: string; name: string; role: string; roleLabel: string }[];
  /** Role → the permissions it holds. */
  grants: Record<string, string[]>;
  permissions: string[];
}) {
  const tx = useT();
  const [who, setWho] = useState(people[0]?.id ?? "");
  const [perm, setPerm] = useState(permissions[0] ?? "");
  const person = people.find((p) => p.id === who);
  const yes = person ? (grants[person.role] ?? []).includes(perm) : false;

  const field = "h-10 w-full rounded-lg border bg-background px-3 text-sm";
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">{tx("Person")}</span>
          <select value={who} onChange={(e) => setWho(e.target.value)} className={field}>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.roleLabel}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">{tx("Permission")}</span>
          <select value={perm} onChange={(e) => setPerm(e.target.value)} className={field}>
            {permissions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
      </div>
      {person ? (
        <div
          className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
            yes ? "border-emerald-500/30 bg-emerald-500/10" : "border-destructive/30 bg-destructive/5"
          }`}
        >
          <span className={`grid size-7 shrink-0 place-items-center rounded-full ${yes ? "bg-emerald-500/20 text-emerald-600" : "bg-destructive/15 text-destructive"}`}>
            {yes ? <Check className="size-4" /> : <X className="size-4" />}
          </span>
          <span>
            <strong>{person.name}</strong> {yes ? tx("can do this.") : tx("cannot do this.")}{" "}
            <span className="text-muted-foreground">
              {tx("By role:")} {person.roleLabel}
            </span>
          </span>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{tx("There is nobody to check yet.")}</p>
      )}
    </div>
  );
}
