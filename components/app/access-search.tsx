"use client";

import { Search } from "lucide-react";

import { useT } from "@/components/app/locale-provider";

/**
 * Narrows the people already on the page as you type — name, email or role.
 * It only hides rows; nothing is fetched and nothing changes.
 */
export function AccessSearch() {
  const tx = useT();
  function filter(value: string) {
    const q = value.trim().toLowerCase();
    document.querySelectorAll<HTMLElement>("[data-access-row]").forEach((row) => {
      row.style.display = q !== "" && !(row.dataset.accessRow ?? "").includes(q) ? "none" : "";
    });
    document.querySelectorAll<HTMLElement>("[data-access-group]").forEach((group) => {
      const any = Array.from(group.querySelectorAll<HTMLElement>("[data-access-row]")).some((r) => r.style.display !== "none");
      group.style.display = any ? "" : "none";
    });
  }
  return (
    <label className="flex h-12 w-full max-w-xl items-center gap-3 rounded-xl border bg-card px-4 focus-within:border-brand/60">
      <Search className="size-4 shrink-0 text-muted-foreground" />
      <input
        type="search"
        onChange={(e) => filter(e.target.value)}
        placeholder={tx("Search by name, email or role")}
        className="h-full w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </label>
  );
}
