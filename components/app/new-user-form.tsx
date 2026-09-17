"use client";

import { useActionState, useState } from "react";
import type { Role, WarehouseKind } from "@prisma/client";
import { UserPlus } from "lucide-react";

import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { STAFF_ROLE_OPTIONS } from "@/components/app/user-row";
import { createUser, type ActionState } from "@/lib/actions/users";
import { ROLE_LABELS } from "@/lib/constants";
import { t, type Locale } from "@/lib/i18n";

const ROLE_FLOOR: Partial<Record<Role, WarehouseKind>> = {
  CHINA_WAREHOUSE: "CHINA",
  DAR_WAREHOUSE: "TANZANIA",
};

export function NewUserForm({
  warehouses,
  actorIsOwner,
  locale,
}: {
  warehouses: { id: string; name: string; kind: WarehouseKind }[];
  actorIsOwner: boolean;
  locale: Locale;
}) {
  const [state, action] = useActionState<ActionState, FormData>(createUser, {});
  const [role, setRole] = useState<Role>("CHINA_WAREHOUSE");

  const roles = actorIsOwner
    ? STAFF_ROLE_OPTIONS
    : STAFF_ROLE_OPTIONS.filter((r) => r !== "ADMIN");
  // Only the floors this role could stand on — a China clerk is never offered
  // the Dar warehouse.
  const floor = ROLE_FLOOR[role];
  const floors = floor ? warehouses.filter((w) => w.kind === floor) : [];

  return (
    <section className="h-fit rounded-xl border bg-card p-6 shadow-soft">
      <h2 className="flex items-center gap-2 font-semibold">
        <UserPlus className="h-4 w-4 text-brand" />
        {t(locale, "Add a staff member")}
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {t(locale, "They sign in with this email and password.")}{" "}
        {t(locale, "Their dashboard is chosen by their role.")}
      </p>

      <form action={action} className="mt-5 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-xs">
            {t(locale, "Full name")}
          </Label>
          <Input id="name" name="name" required />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-xs">
            {t(locale, "Work email")}
          </Label>
          <Input id="email" name="email" type="email" required />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="phone" className="text-xs">
            {t(locale, "Phone")}
          </Label>
          <Input id="phone" name="phone" inputMode="tel" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="role" className="text-xs">
            {t(locale, "Role")}
          </Label>
          <NativeSelect
            id="role"
            name="role"
            value={role}
            onChange={(e) => setRole(e.currentTarget.value as Role)}
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {t(locale, ROLE_LABELS[r])}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="warehouseId" className="text-xs">
            {t(locale, "Warehouse")}
          </Label>
          <NativeSelect
            id="warehouseId"
            name="warehouseId"
            key={role}
            defaultValue={floors.length === 1 ? floors[0].id : ""}
            disabled={!floor}
          >
            <option value="">
              {floor ? t(locale, "Choose a warehouse…") : t(locale, "Not warehouse staff")}
            </option>
            {floors.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </NativeSelect>
          <p className="text-xs text-muted-foreground">
            {t(locale, "Warehouse applies to warehouse staff only.")}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="status" className="text-xs">
            {t(locale, "Status")}
          </Label>
          <NativeSelect id="status" name="status" defaultValue="ACTIVE">
            <option value="ACTIVE">{t(locale, "Active")}</option>
            <option value="SUSPENDED">{t(locale, "Suspended")}</option>
            <option value="INACTIVE">{t(locale, "Inactive")}</option>
          </NativeSelect>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-xs">
            {t(locale, "Temporary password")}
          </Label>
          <Input
            id="password"
            name="password"
            type="text"
            minLength={8}
            placeholder={t(locale, "At least 8 characters")}
            required
          />
          <p className="text-xs text-muted-foreground">
            {t(
              locale,
              "Give it to them in person and change it after their first sign-in."
            )}
          </p>
        </div>

        <FormMessage
          error={state.error ? t(locale, state.error) : undefined}
          ok={state.ok}
        />

        <SubmitButton className="w-full" pendingLabel={t(locale, "Creating…")}>
          {t(locale, "Create account")}
        </SubmitButton>
      </form>
    </section>
  );
}
