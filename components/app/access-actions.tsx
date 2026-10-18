"use client";

import { useActionState } from "react";
import { Trash2, UserRoundX, UserRoundCheck } from "lucide-react";

import { deleteAccount, reactivateAccount, suspendAccount, type AccessState } from "@/lib/actions/developer";

/** Suspend: a reason and the word CONFIRM, so it cannot be an accident. */
export function SuspendForm({ userId, name }: { userId: string; name: string }) {
  const [state, action, pending] = useActionState<AccessState, FormData>(suspendAccount, {});
  return (
    <details className="relative">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground">
        <UserRoundX className="size-4" />
        Suspend
      </summary>
      <form action={action} className="absolute right-0 z-20 mt-2 w-72 space-y-2 rounded-xl border bg-card p-3 shadow-lg">
        <input type="hidden" name="userId" value={userId} />
        <p className="text-sm font-medium">Suspend {name}?</p>
        <input name="reason" required placeholder="Why" className="h-9 w-full rounded-lg border bg-background px-2 text-sm" />
        <input name="confirm" required placeholder="Type CONFIRM" className="h-9 w-full rounded-lg border bg-background px-2 text-sm" />
        {state.error ? <p className="text-xs text-destructive">{state.error}</p> : null}
        {state.ok ? <p className="text-xs text-success">{state.ok}</p> : null}
        <button disabled={pending} className="h-9 w-full rounded-lg bg-destructive text-sm font-medium text-destructive-foreground disabled:opacity-50">
          {pending ? "Suspending…" : "Suspend"}
        </button>
      </form>
    </details>
  );
}

export function ReactivateForm({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState<AccessState, FormData>(reactivateAccount, {});
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      {state.error ? <span className="text-xs text-destructive">{state.error}</span> : null}
      <button disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-secondary disabled:opacity-50">
        <UserRoundCheck className="size-4" />
        Re-activate
      </button>
    </form>
  );
}

/** Delete: a reason and the word DELETE, because it cannot be undone. */
export function DeleteForm({ userId, name }: { userId: string; name: string }) {
  const [state, action, pending] = useActionState<AccessState, FormData>(deleteAccount, {});
  return (
    <details className="relative">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10">
        <Trash2 className="size-4" />
        Delete
      </summary>
      <form action={action} className="absolute right-0 z-20 mt-2 w-72 space-y-2 rounded-xl border bg-card p-3 shadow-lg">
        <input type="hidden" name="userId" value={userId} />
        <p className="text-sm font-medium">Delete {name}’s account?</p>
        <p className="text-xs text-muted-foreground">They lose all access and can never sign in again. Everything they recorded stays, under their name.</p>
        <input name="reason" required placeholder="Why" className="h-9 w-full rounded-lg border bg-background px-2 text-sm" />
        <input name="confirm" required placeholder="Type DELETE" className="h-9 w-full rounded-lg border bg-background px-2 text-sm" />
        {state.error ? <p className="text-xs text-destructive">{state.error}</p> : null}
        {state.ok ? <p className="text-xs text-success">{state.ok}</p> : null}
        <button disabled={pending} className="h-9 w-full rounded-lg bg-destructive text-sm font-medium text-destructive-foreground disabled:opacity-50">
          {pending ? "Deleting…" : "Delete account"}
        </button>
      </form>
    </details>
  );
}
