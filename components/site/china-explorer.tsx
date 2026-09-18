"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Building2, Clock, MapPin, Search, Store, X } from "lucide-react";

import { PHOTOS } from "@/components/site/photos";
import type { Place } from "@/lib/china-guide";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * EXPLORE CHINA, THE WAY A TRAVEL SITE SHOWS A COUNTRY.
 *
 * A search box that asks what the visitor wants to buy, two tabs — cities and
 * markets — and a grid of picture cards. A card opens the place: what it is,
 * what people buy there, and the three things we can do about it. The search
 * matches names and goods, so "shoes" finds Jinjiang and Dongguan without the
 * visitor having to know either name.
 */
export function ChinaExplorer({ cities, markets }: { cities: Place[]; markets: Place[] }) {
  const locale = DEFAULT_LOCALE;
  const [tab, setTab] = useState<"cities" | "markets">("cities");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Place | null>(null);
  const dialog = useRef<HTMLDialogElement | null>(null);

  const list = tab === "cities" ? cities : markets;
  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      q
        ? [...cities, ...markets].filter((p) =>
            [p.name, p.where, p.tagline, ...p.goods].some((s) => s.toLowerCase().includes(q))
          )
        : list,
    [q, list, cities, markets]
  );

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  const suggestions = ["Clothing", "Shoes", "Electronics", "Furniture", "Toys", "Cosmetics", "Auto parts", "Lighting"];

  return (
    <div>
      {/* The search panel, raised over the hero's lower edge. */}
      <div className="relative z-10 -mt-24 rounded-[2rem] border bg-card p-4 shadow-[0_40px_80px_-40px_rgba(4,14,26,0.55)] sm:p-6">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["cities", Building2, "Trading cities"],
              ["markets", Store, "Markets and fairs"],
            ] as const
          ).map(([key, Icon, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setTab(key);
                setQuery("");
              }}
              className={cn(
                "focus-ring inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition-colors",
                tab === key && !q
                  ? "bg-brand text-brand-foreground shadow-soft"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <Icon className="size-4" />
              {t(locale, label)}
            </button>
          ))}
        </div>
        <label className="mt-4 flex items-center gap-3 rounded-2xl border bg-background px-4 py-3 focus-within:border-brand">
          <Search className="size-5 shrink-0 text-muted-foreground" />
          <span className="sr-only">{t(locale, "What do you want to buy?")}</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t(locale, "What do you want to buy? Shoes, phones, tiles…")}
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="rounded-full p-1 text-muted-foreground hover:bg-secondary"
              aria-label={t(locale, "Clear")}
            >
              <X className="size-4" />
            </button>
          ) : null}
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setQuery(s)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                q === s.toLowerCase()
                  ? "border-signal bg-signal/10 text-signal"
                  : "text-muted-foreground hover:border-brand hover:text-brand"
              )}
            >
              {t(locale, s)}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-12 flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          {q
            ? `${shown.length} ${t(locale, shown.length === 1 ? "place for" : "places for")} “${query.trim()}”`
            : tab === "cities"
              ? t(locale, "Trading cities")
              : t(locale, "Markets and fairs")}
        </h2>
        <p className="text-sm text-muted-foreground">{t(locale, "Tap a card to explore it")}</p>
      </div>

      {shown.length === 0 ? (
        <p className="mt-8 rounded-2xl border bg-surface-2 p-8 text-center text-muted-foreground">
          {t(locale, "Nothing in the guide matches that yet — ask us, we probably know where it is made.")}{" "}
          <Link href="/contact" className="font-semibold text-brand hover:underline">
            {t(locale, "Contact us")}
          </Link>
        </p>
      ) : (
        <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {shown.map((place, i) => (
            <li
              key={place.slug}
              className="animate-in-up"
              style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
            >
              <button
                type="button"
                onClick={() => setOpen(place)}
                className="focus-ring group relative block aspect-[3/4] w-full overflow-hidden rounded-[1.75rem] bg-ink text-left"
              >
                <Image
                  src={PHOTOS[place.photo].src}
                  alt={PHOTOS[place.photo].alt}
                  fill
                  placeholder="blur"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                  className="site-zoom object-cover"
                />
                <span className="absolute inset-0 bg-gradient-to-t from-ink via-ink/25 to-transparent" />
                <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white backdrop-blur-md">
                  <MapPin className="size-3.5" />
                  {place.where}
                </span>
                <span className="absolute right-4 top-4 grid size-10 place-items-center rounded-full bg-white text-slate-900 transition-transform duration-500 group-hover:rotate-45">
                  <ArrowUpRight className="size-4" />
                </span>
                <span className="absolute inset-x-0 bottom-0 p-5 text-white">
                  <span className="block font-display text-2xl font-bold leading-tight tracking-tight">
                    {place.name}
                  </span>
                  <span className="mt-1 block text-sm text-white/75">{t(locale, place.tagline)}</span>
                  <span className="mt-3 flex flex-wrap gap-1.5">
                    {place.goods.slice(0, 3).map((g) => (
                      <span key={g} className="rounded-full bg-white/15 px-2 py-0.5 text-[0.7rem] backdrop-blur-md">
                        {t(locale, g)}
                      </span>
                    ))}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <dialog
        ref={dialog}
        onClose={() => setOpen(null)}
        onClick={(e) => e.target === dialog.current && setOpen(null)}
        className="m-auto w-[min(56rem,calc(100vw-2rem))] overflow-hidden rounded-[2rem] bg-card p-0 text-card-foreground shadow-2xl backdrop:bg-ink/70 backdrop:backdrop-blur-sm"
      >
        {open ? (
          <div className="grid md:grid-cols-2">
            <div className="relative min-h-[16rem] md:min-h-full">
              <Image
                src={PHOTOS[open.photo].src}
                alt={PHOTOS[open.photo].alt}
                fill
                placeholder="blur"
                sizes="(max-width: 768px) 100vw, 28rem"
                className="object-cover"
              />
              <span className="absolute inset-0 bg-gradient-to-t from-ink/80 to-transparent md:bg-gradient-to-r" />
              <span className="absolute bottom-4 left-4 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white backdrop-blur-md">
                <MapPin className="size-3.5" />
                {open.where}
              </span>
            </div>
            <div className="max-h-[80vh] overflow-y-auto p-6 sm:p-8">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-signal">
                    {t(locale, open.tagline)}
                  </p>
                  <h3 className="mt-1 font-display text-3xl font-bold tracking-tight">{open.name}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(null)}
                  className="focus-ring rounded-full border p-2 text-muted-foreground hover:bg-secondary"
                  aria-label={t(locale, "Close")}
                >
                  <X className="size-4" />
                </button>
              </div>
              {open.distance ? (
                <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Clock className="size-4" />
                  {t(locale, open.distance)}
                  {open.slug !== "guangzhou" ? ` ${t(locale, "from Guangzhou")}` : null}
                </p>
              ) : null}
              <p className="mt-4 leading-relaxed text-muted-foreground">{t(locale, open.about)}</p>
              <p className="mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {t(locale, "What people buy here")}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {open.goods.map((g) => (
                  <span key={g} className="rounded-full bg-brand/10 px-3 py-1 text-sm font-medium text-brand">
                    {t(locale, g)}
                  </span>
                ))}
              </div>
              <div className="mt-7 grid gap-2">
                <Link
                  href="/pickup"
                  className="track-go inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-white"
                >
                  {t(locale, "We collect from your supplier")}
                  <ArrowRight className="size-4" />
                </Link>
                <Link
                  href={`/book?service=SHARED_CARGO&commodity=${encodeURIComponent(open.goods[0])}`}
                  className="inline-flex items-center justify-center gap-2 rounded-full border px-5 py-3 text-sm font-semibold hover:bg-secondary"
                >
                  {t(locale, "Book space on a sailing")}
                </Link>
                <Link
                  href="/contact"
                  className="inline-flex items-center justify-center gap-2 rounded-full px-5 py-2 text-sm font-medium text-brand hover:underline"
                >
                  {t(locale, "Ask us about buying here")}
                </Link>
              </div>
            </div>
          </div>
        ) : null}
      </dialog>
    </div>
  );
}
