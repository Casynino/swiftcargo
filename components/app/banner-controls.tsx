"use client";

import Link from "next/link";
import { Bell } from "lucide-react";

import { useShell } from "@/components/app/shell-context";
import { ThemeToggle } from "@/components/theme-toggle";
import { useT } from "@/components/app/locale-provider";

/** The bell and the moon that sit in the corner of the banner, as in Target's. */
export function BannerControls() {
  const { unread } = useShell();
  const tx = useT();
  return (
    <div className="flex items-center gap-1.5 text-white/85">
      <Link
        href="/app/notifications"
        aria-label={unread > 0 ? `${tx("Notifications")}, ${unread}` : tx("Notifications")}
        className="relative grid size-9 place-items-center rounded-full transition-colors hover:bg-white/10"
      >
        <Bell className="size-[18px]" />
        {unread > 0 ? (
          <span className="tnum absolute -right-0.5 -top-0.5 grid min-w-[18px] place-items-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-[18px] text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </Link>
      <ThemeToggle className="text-white/85 hover:bg-white/10 hover:text-white" />
    </div>
  );
}
