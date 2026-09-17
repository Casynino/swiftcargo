import { BadgeCheck, Building2, CalendarDays, Warehouse } from "lucide-react";

import { t, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type ProfileIdentity = {
  name: string;
  email: string;
  departmentLabel: string;
  roleLabel: string;
  warehouseName: string | null;
  joinedLabel: string;
  online: boolean;
  lastSeenLabel: string | null;
  status: string;
};

/**
 * The top of a profile: who this is, at a glance.
 *
 * Two floors a month apart by sea, staffed by people who mostly know each other
 * by first name — the warehouse line under the name is what tells a Dar manager
 * whether this is somebody from their own floor or from Guangzhou.
 */
export function ProfileHeader({
  identity,
  locale,
  actions,
}: {
  identity: ProfileIdentity;
  locale: Locale;
  actions?: React.ReactNode;
}) {
  const initials = identity.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-soft">
      <div className="flex flex-wrap items-start gap-5 p-6">
        <div className="relative shrink-0">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl border bg-muted text-2xl font-bold text-muted-foreground">
            {initials || "?"}
          </div>
          <span
            title={
              identity.online
                ? t(locale, "Online now")
                : identity.lastSeenLabel
                  ? t(locale, "Last seen {when}").replace("{when}", identity.lastSeenLabel)
                  : t(locale, "Never signed in")
            }
            className={cn(
              "absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-2 border-card",
              identity.online ? "bg-success" : "bg-muted-foreground/40"
            )}
          />
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold leading-tight">{identity.name}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{identity.email}</p>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" />
              {t(locale, identity.departmentLabel)}
            </span>
            {/* Warehouse roles are named after their department, so this chip
                would only repeat the line before it. */}
            {identity.roleLabel !== identity.departmentLabel ? (
              <span className="inline-flex items-center gap-1.5">
                <BadgeCheck className="h-3.5 w-3.5" />
                {t(locale, identity.roleLabel)}
              </span>
            ) : null}
            {identity.warehouseName ? (
              <span className="inline-flex items-center gap-1.5">
                <Warehouse className="h-3.5 w-3.5" />
                {identity.warehouseName}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              {t(locale, "Joined")} {identity.joinedLabel}
            </span>
          </div>

          <p className="mt-2 text-xs">
            <span
              className={cn(
                "font-medium",
                identity.online ? "text-success" : "text-muted-foreground"
              )}
            >
              {identity.online
                ? t(locale, "Online now")
                : identity.lastSeenLabel
                  ? t(locale, "Last active {when}").replace("{when}", identity.lastSeenLabel)
                  : t(locale, "Has never signed in")}
            </span>
            {identity.status !== "ACTIVE" ? (
              <span className="ml-2 rounded-full bg-warning/10 px-2 py-0.5 font-medium text-warning">
                {identity.status === "SUSPENDED"
                  ? t(locale, "Suspended")
                  : t(locale, "Inactive")}
              </span>
            ) : null}
          </p>
        </div>

        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </section>
  );
}
