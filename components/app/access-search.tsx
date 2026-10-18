"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

import { useT } from "@/components/app/locale-provider";

/**
 * Narrows the people on the page as you type — name, email or role — and,
 * after a short pause, asks the page for customers matching the same words
 * (name or phone number). Clear the box and the customers go away again.
 */
export function AccessSearch({ initial = "" }: { initial?: string }) {
  const tx = useT();
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  function change(value: string) {
    filter(value);
    if (timer.current) clearTimeout(timer.current);
    const q = value.trim();
    timer.current = setTimeout(() => {
      router.replace(q.length >= 2 ? `?q=${encodeURIComponent(q)}` : "?", { scroll: false });
    }, 350);
  }

  useEffect(() => {
    if (initial) filter(initial);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [initial]);

  return (
    <label className="flex h-12 w-full max-w-xl items-center gap-3 rounded-xl border bg-card px-4 focus-within:border-brand/60">
      <Search className="size-4 shrink-0 text-muted-foreground" />
      <input
        type="search"
        defaultValue={initial}
        onChange={(e) => change(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.preventDefault();
        }}
        placeholder={tx("Search by name, email or role — or a customer’s name or phone")}
        className="h-full w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </label>
  );
}
