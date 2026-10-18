"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Role, WarehouseKind } from "@prisma/client";
import { Check, Copy, Eye, EyeOff, RefreshCw, UserPlus } from "lucide-react";

import { Modal } from "@/components/app/modal";
import { STAFF_ROLE_OPTIONS } from "@/components/app/user-row";
import { createUser, type ActionState } from "@/lib/actions/users";
import { ROLE_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";

const FLOOR: Partial<Record<Role, WarehouseKind>> = { CHINA_WAREHOUSE: "CHINA", DAR_WAREHOUSE: "TANZANIA" };

/** Letters and digits that cannot be misread over the phone: no 0/O, 1/l/I. */
function makePassword() {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint32Array(12));
  return Array.from(bytes, (n) => alphabet[n % alphabet.length]).join("");
}

const field = "h-11 w-full rounded-xl border bg-background px-3.5 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20";

/**
 * ADD AN ACCOUNT, IN A POP-UP.
 *
 * One button, one dialog: name, email, role, and a password the system can
 * make for you. Only the warehouse roles ask which warehouse. When it is made,
 * the dialog says so and keeps the sign-in details on screen to hand over.
 */
export function AddAccountDialog({
  warehouses,
  variant = "button",
}: {
  warehouses: { id: string; name: string; kind: WarehouseKind }[];
  /** "card" is the tile on the developer home; "button" is the plain button. */
  variant?: "button" | "card";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(createUser, {});
  const [role, setRole] = useState<Role>("FINANCE");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(true);
  const [copied, setCopied] = useState(false);
  const [done, setDone] = useState<{ email: string; password: string; name: string } | null>(null);
  /* What was typed, kept at the moment of pressing — the form clears itself
     once it has been sent, and the sign-in details must still be on screen. */
  const typed = useRef<{ email: string; password: string; name: string } | null>(null);

  const kind = FLOOR[role];
  const floors = kind ? warehouses.filter((w) => w.kind === kind) : [];

  useEffect(() => {
    if (open && !password) setPassword(makePassword());
  }, [open, password]);

  useEffect(() => {
    if (state.ok && typed.current) {
      setDone(typed.current);
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const close = () => {
    setOpen(false);
    setDone(null);
    setPassword("");
    setCopied(false);
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* the details stay on screen to be read out */
    }
  };

  return (
    <>
      {variant === "card" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group flex h-full w-full items-start gap-3.5 rounded-xl border bg-card p-4 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand"><UserPlus className="size-5" /></span>
          <span>
            <span className="block text-sm font-semibold">Add an account →</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">Open an account for anyone on the team. They can sign in straight away.</span>
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground shadow-sm hover:opacity-90"
        >
          <UserPlus className="size-4" />
          Add an account
        </button>
      )}

      {open ? (
        <Modal title={done ? "Account created" : "Add an account"} onClose={close} className="max-w-md">
          {done ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-xl bg-success/10 p-4 text-success">
                <span className="grid size-9 place-items-center rounded-full bg-success/20"><Check className="size-5" /></span>
                <p className="text-sm font-medium">{done.name} can sign in now.</p>
              </div>
              <dl className="space-y-2 rounded-xl border p-4 text-sm">
                <div><dt className="text-xs text-muted-foreground">Email</dt><dd className="font-medium">{done.email}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Temporary password</dt><dd className="font-mono font-medium">{done.password}</dd></div>
              </dl>
              <p className="text-xs text-muted-foreground">Give these to them in person. This is the only time the password is shown.</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => copy(`${done.email}\n${done.password}`)} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border text-sm font-medium hover:bg-secondary">
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {copied ? "Copied" : "Copy details"}
                </button>
                <button type="button" onClick={close} className="h-11 flex-1 rounded-xl bg-brand text-sm font-semibold text-brand-foreground">Done</button>
              </div>
            </div>
          ) : (
            <form
              action={action}
              onSubmit={(e) => {
                const f = new FormData(e.currentTarget);
                typed.current = { email: String(f.get("email")), password: String(f.get("password")), name: String(f.get("name")) };
              }}
              className="space-y-4"
            >
              <input type="hidden" name="status" value="ACTIVE" />
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Full name</span>
                <input name="name" required autoFocus className={field} placeholder="e.g. Asha Juma" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Email</span>
                <input name="email" type="email" required className={field} placeholder="name@company.com" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Phone <span className="font-normal">(optional)</span></span>
                <input name="phone" inputMode="tel" className={field} placeholder="+255…" />
              </label>

              <div className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Role</span>
                <input type="hidden" name="role" value={role} />
                <div className="flex flex-wrap gap-2">
                  {STAFF_ROLE_OPTIONS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRole(r)}
                      className={cn(
                        "rounded-full border px-3.5 py-1.5 text-sm transition",
                        role === r ? "border-brand bg-brand text-brand-foreground" : "hover:bg-secondary"
                      )}
                    >
                      {ROLE_LABELS[r]}
                    </button>
                  ))}
                </div>
              </div>

              {kind && floors.length > 1 ? (
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Warehouse</span>
                  <select name="warehouseId" className={field}>
                    {floors.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </label>
              ) : null}

              <div className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Temporary password</span>
                <div className="flex gap-2">
                  <input
                    name="password"
                    required
                    minLength={8}
                    type={show ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={cn(field, "font-mono")}
                  />
                  <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"} className="grid size-11 shrink-0 place-items-center rounded-xl border hover:bg-secondary">
                    {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                  <button type="button" onClick={() => setPassword(makePassword())} aria-label="Make a new password" title="Make a new password" className="grid size-11 shrink-0 place-items-center rounded-xl border hover:bg-secondary">
                    <RefreshCw className="size-4" />
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">Made for you. They should change it after their first sign-in.</p>
              </div>

              {state.error ? <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p> : null}

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={close} className="h-11 rounded-xl border px-5 text-sm font-medium hover:bg-secondary">Cancel</button>
                <button type="submit" disabled={pending} className="h-11 flex-1 rounded-xl bg-brand text-sm font-semibold text-brand-foreground disabled:opacity-60">
                  {pending ? "Creating…" : "Create account"}
                </button>
              </div>
            </form>
          )}
        </Modal>
      ) : null}
    </>
  );
}
