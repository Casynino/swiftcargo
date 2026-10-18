"use client";

import { useState } from "react";
import { LogIn, Search } from "lucide-react";

import { Modal } from "@/components/app/modal";
import { startWorkAs } from "@/lib/actions/developer";
import { ROLE_LABELS } from "@/lib/constants";

type Person = { id: string; name: string; role: keyof typeof ROLE_LABELS };

/**
 * WORK AS, FROM ANYWHERE: PICK A NAME.
 *
 * Everyone the developer may work as, by name and role. One click on a row
 * opens the system as them. The server decides who is allowed — this only
 * lists them.
 */
export function WorkAsDialog({ people }: { people: Person[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const shown = people.filter((p) => `${p.name} ${ROLE_LABELS[p.role]}`.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-full w-full items-start gap-4 rounded-2xl border bg-card p-5 text-left transition hover:border-foreground/30"
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary"><LogIn className="size-5" /></span>
        <span>
          <span className="block font-semibold">Work as →</span>
          <span className="mt-1 block text-sm text-muted-foreground">Pick a name and open the system exactly as that person sees it. One click, and every action is recorded under yours.</span>
        </span>
      </button>
      {open ? (
        <Modal title="Work as…" onClose={() => { setOpen(false); setQ(""); }} className="max-w-sm">
          {people.length > 6 ? (
            <label className="flex h-10 items-center gap-2 rounded-xl border bg-background px-3 focus-within:border-brand">
              <Search className="size-4 text-muted-foreground" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a name" className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none" />
            </label>
          ) : null}
          <ul className="-mx-1 max-h-[22rem] space-y-1 overflow-y-auto">
            {shown.map((p) => (
              <li key={p.id}>
                <form action={startWorkAs}>
                  <input type="hidden" name="userId" value={p.id} />
                  <button type="submit" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-secondary">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand/10 text-xs font-semibold text-brand">
                      {p.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{p.name}</span>
                      <span className="block text-xs text-muted-foreground">{ROLE_LABELS[p.role]}</span>
                    </span>
                    <LogIn className="size-4 text-muted-foreground" />
                  </button>
                </form>
              </li>
            ))}
            {shown.length === 0 ? <li className="py-6 text-center text-sm text-muted-foreground">Nobody matches.</li> : null}
          </ul>
        </Modal>
      ) : null}
    </>
  );
}
