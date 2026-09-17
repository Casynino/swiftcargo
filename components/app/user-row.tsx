"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { Role } from "@prisma/client";
import { KeyRound } from "lucide-react";

import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  changeUserRole,
  resetUserPassword,
  setUserActive,
  type ActionState,
} from "@/lib/actions/users";
import { ROLE_LABELS } from "@/lib/constants";
import { formatRelative } from "@/lib/format";
import { t, type Locale } from "@/lib/i18n";

export const STAFF_ROLE_OPTIONS: Role[] = [
  "CHINA_WAREHOUSE",
  "DAR_WAREHOUSE",
  "FINANCE",
  "CUSTOMER_SUPPORT",
  "MANAGER",
  "ADMIN",
];

type StaffUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  warehouseName: string | null;
  role: Role;
  active: boolean;
  lastLoginAt: string | null;
};

export function UserRow({
  user,
  isSelf,
  actorIsOwner,
  locale,
}: {
  user: StaffUser;
  isSelf: boolean;
  /** Only the owner may write the owner's role, so only the owner is offered it. */
  actorIsOwner: boolean;
  locale: Locale;
}) {
  const [showReset, setShowReset] = useState(false);
  const [activeState, activeAction] = useActionState<ActionState, FormData>(
    setUserActive,
    {}
  );
  const [roleState, roleAction] = useActionState<ActionState, FormData>(
    changeUserRole,
    {}
  );
  const [resetState, resetAction] = useActionState<ActionState, FormData>(
    resetUserPassword,
    {}
  );

  /* An owner account is out of a manager's reach in every column. The server
     refuses regardless; hiding the controls only spares the manager a refusal. */
  const locked = user.role === "ADMIN" && !actorIsOwner;
  const roles = actorIsOwner
    ? STAFF_ROLE_OPTIONS
    : STAFF_ROLE_OPTIONS.filter((role) => role !== "ADMIN");
  const rowError = activeState.error ?? roleState.error;

  return (
    <>
      <TableRow className={user.active ? "" : "opacity-60"}>
        <TableCell>
          {/* The name opens the full employee profile — sign-in history, audit
              trail and the cargo they have handled. */}
          <Link
            href={`/app/admin/users/${user.id}`}
            className="text-sm font-medium hover:text-brand"
          >
            {user.name}
            {isSelf ? (
              <span className="ml-2 text-xs text-muted-foreground">
                ({t(locale, "you")})
              </span>
            ) : null}
          </Link>
          <p className="text-xs text-muted-foreground">{user.email}</p>
          {user.phone ? (
            <p className="text-xs text-muted-foreground">{user.phone}</p>
          ) : null}
          {user.warehouseName ? (
            <p className="text-xs text-muted-foreground">{user.warehouseName}</p>
          ) : null}
          {rowError ? (
            <p role="alert" className="mt-1 text-xs text-destructive">
              {t(locale, rowError)}
            </p>
          ) : null}
        </TableCell>

        <TableCell className="hidden md:table-cell">
          {isSelf || locked ? (
            <Badge tone="progress">{t(locale, ROLE_LABELS[user.role])}</Badge>
          ) : (
            <form action={roleAction} className="flex items-center gap-2">
              <input type="hidden" name="userId" value={user.id} />
              <NativeSelect
                /* Re-keyed on the server's answer, so a refused change cannot
                   leave the dropdown showing a role nobody was given. */
                key={`${user.role}-${roleState.error ?? ""}`}
                name="role"
                defaultValue={user.role}
                className="h-9 w-44 text-xs"
              >
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {t(locale, ROLE_LABELS[role])}
                  </option>
                ))}
              </NativeSelect>
              <SubmitButton size="sm" variant="ghost" pendingLabel="…">
                {t(locale, "Save")}
              </SubmitButton>
            </form>
          )}
        </TableCell>

        <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
          {user.lastLoginAt ? formatRelative(user.lastLoginAt) : t(locale, "Never")}
        </TableCell>

        <TableCell className="text-right">
          {locked ? null : (
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setShowReset((v) => !v)}
                title={t(locale, "Reset password")}
                aria-label={t(locale, "Reset password")}
              >
                <KeyRound className="h-4 w-4" />
              </Button>
              {isSelf ? null : (
                <form action={activeAction}>
                  <input type="hidden" name="userId" value={user.id} />
                  <input
                    type="hidden"
                    name="active"
                    value={user.active ? "false" : "true"}
                  />
                  <SubmitButton
                    size="sm"
                    variant={user.active ? "ghost" : "outline"}
                    pendingLabel="…"
                  >
                    {user.active ? t(locale, "Deactivate") : t(locale, "Reactivate")}
                  </SubmitButton>
                </form>
              )}
            </div>
          )}
        </TableCell>
      </TableRow>

      {showReset && !locked ? (
        <TableRow>
          <TableCell colSpan={4} className="bg-muted/40">
            <form action={resetAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="userId" value={user.id} />
              <div className="flex-1 space-y-1.5">
                <Label htmlFor={`pw-${user.id}`} className="text-xs">
                  {/* One dictionary entry with the name slotted in: the name
                      does not sit in the same place in every language. */}
                  {t(locale, "New password for {name}").replace("{name}", user.name)}
                </Label>
                <Input
                  id={`pw-${user.id}`}
                  name="password"
                  type="text"
                  minLength={8}
                  placeholder={t(locale, "At least 8 characters")}
                  required
                />
              </div>
              <SubmitButton pendingLabel={t(locale, "Saving…")}>
                {t(locale, "Set password")}
              </SubmitButton>
            </form>
            <div className="mt-2">
              <FormMessage
                error={resetState.error ? t(locale, resetState.error) : undefined}
                ok={resetState.ok}
              />
            </div>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}
