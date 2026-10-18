"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { Trash2, UserRoundX, UserRoundCheck } from "lucide-react";

import { Modal } from "@/components/app/modal";
import { deleteAccount, reactivateAccount, suspendAccount, type AccessState } from "@/lib/actions/developer";

/** One question, two buttons: nothing to type. */
function ConfirmDialog({
  trigger,
  tone,
  title,
  body,
  confirmLabel,
  userId,
  action,
}: {
  trigger: React.ReactNode;
  tone: "neutral" | "danger";
  title: string;
  body: string;
  confirmLabel: string;
  userId: string;
  action: (prev: AccessState, formData: FormData) => Promise<AccessState>;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<AccessState, FormData>(action, {});
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={tone === "danger" ? "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10" : "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"}>
        {trigger}
      </button>
      {open ? (
        <Modal title={title} onClose={close} className="max-w-md">
          <p className="text-sm text-muted-foreground">{body}</p>
          <form action={formAction} className="space-y-3">
            <input type="hidden" name="userId" value={userId} />
            {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={close} className="h-10 rounded-lg border px-4 text-sm font-medium hover:bg-secondary">Cancel</button>
              <button disabled={pending} className="h-10 rounded-lg bg-destructive px-4 text-sm font-semibold text-destructive-foreground disabled:opacity-50">
                {pending ? "Please wait…" : confirmLabel}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}

export function SuspendForm({ userId, name }: { userId: string; name: string }) {
  return (
    <ConfirmDialog
      trigger={<><UserRoundX className="size-4" />Suspend</>}
      tone="neutral"
      title={`Suspend ${name}?`}
      body="They are signed out at once and cannot sign in until you re-activate them. Nothing they recorded is touched."
      confirmLabel="Confirm"
      userId={userId}
      action={suspendAccount}
    />
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

export function DeleteForm({ userId, name }: { userId: string; name: string }) {
  return (
    <ConfirmDialog
      trigger={<><Trash2 className="size-4" />Delete</>}
      tone="danger"
      title={`Delete ${name}’s account?`}
      body="They lose all access and can never sign in again. Everything they recorded stays, under their name."
      confirmLabel="Confirm"
      userId={userId}
      action={deleteAccount}
    />
  );
}
