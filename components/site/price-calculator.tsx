"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, Box, Container, Loader2, Minus, Plus, Ruler, X } from "lucide-react";

import { NativeSelect } from "@/components/ui/native-select";
import { estimateFreight, type EstimateState } from "@/lib/actions/estimate";
import { cbmNumber } from "@/lib/cbm";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type FullContainerPrice = { cargoType: string; price: string };

type BoxLine = { id: number; length: string; width: string; height: string; boxes: string };

/* A 20ft box holds about 33 CBM. Only used to draw how full the picture is. */
const TWENTY_FOOT_CBM = 33;

/**
 * THE SHIPPING PRICE CALCULATOR.
 *
 * One card: choose the goods, say how much — as CBM, or as box sizes — and the
 * price is there, updating as the figures change. The rate book itself is
 * never printed; a rate is only shown as the answer for the goods chosen.
 *
 * The volume is worked out here with lib/cbm.ts, the function the warehouse
 * counter uses. The money is not: every figure comes back from the server
 * (lib/actions/estimate.ts → lib/public-estimate.ts), priced from the same
 * rate book, minimum, VAT and exchange rate as the invoice, in Decimal.
 */
export function PriceCalculator({
  cargoTypes,
  containers = [],
  start = "cbm",
}: {
  cargoTypes: string[];
  containers?: FullContainerPrice[];
  /** Which way of giving the volume the card opens on. */
  start?: "cbm" | "boxes";
}) {
  const locale = DEFAULT_LOCALE;
  const [service, setService] = useState<"LCL" | "FCL">("LCL");
  const [how, setHow] = useState<"cbm" | "boxes">(start);
  const [cargoType, setCargoType] = useState("");
  const [cbmTyped, setCbmTyped] = useState("1");
  const [lines, setLines] = useState<BoxLine[]>([{ id: 1, length: "", width: "", height: "", boxes: "1" }]);
  const [container, setContainer] = useState(containers[0]?.cargoType ?? "");
  const [result, setResult] = useState<{ key: string; state: EstimateState } | null>(null);
  const [pending, startTransition] = useTransition();
  const nextId = useRef(2);

  const boxCbm = useMemo(
    () =>
      lines.reduce((sum, line) => {
        const value = cbmNumber({
          length: line.length || null,
          width: line.width || null,
          height: line.height || null,
          quantity: Math.max(0, Math.floor(Number(line.boxes) || 0)),
          unit: "CM",
        });
        return sum + (value && value > 0 ? value : 0);
      }, 0),
    [lines]
  );

  const cbm = how === "cbm" ? Math.max(0, Number(cbmTyped) || 0) : boxCbm;
  const key = `${cargoType}:${cbm.toFixed(3)}`;

  /* Priced a moment after the typing stops, so a customer sees the answer
     move with the figures without every keystroke becoming a request. */
  useEffect(() => {
    if (service !== "LCL" || !cargoType || cbm <= 0) return;
    const timer = setTimeout(() => {
      const form = new FormData();
      form.set("cargoType", cargoType);
      form.set("cbm", cbm.toFixed(3));
      startTransition(async () => {
        const state = await estimateFreight({}, form);
        setResult({ key, state });
      });
    }, 450);
    return () => clearTimeout(timer);
  }, [key, cargoType, cbm, service]);

  const answer = result?.key === key ? result.state : undefined;
  const priced = answer?.estimate?.kind === "priced" ? answer.estimate : null;
  const fill = Math.min(100, (cbm / TWENTY_FOOT_CBM) * 100);
  const chosenContainer = containers.find((c) => c.cargoType === container);

  const step = (delta: number) =>
    setCbmTyped((v) => String(Math.max(0, Math.round(((Number(v) || 0) + delta) * 10) / 10)));

  return (
    <div className="grid overflow-hidden rounded-[2rem] border bg-card shadow-[0_40px_80px_-40px_rgba(4,14,26,0.55)] lg:grid-cols-[1.15fr_0.85fr]">
      {/* ---------------------------------------------------- The question */}
      <div className="flex flex-col p-5 sm:p-8">
        {containers.length > 0 ? (
          <div className="inline-flex rounded-full bg-secondary p-1">
            {(
              [
                ["LCL", Box, "Loose cargo"],
                ["FCL", Container, "Full container"],
              ] as const
            ).map(([value, Icon, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setService(value)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                  service === value
                    ? "bg-brand text-brand-foreground shadow-soft"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="size-4" />
                {t(locale, label)}
              </button>
            ))}
          </div>
        ) : null}

        {service === "LCL" ? (
          <div className={cn("space-y-7", containers.length > 0 && "mt-7")}>
            <Step n={1} title={t(locale, "What are you shipping?")}>
              <NativeSelect
                aria-label={t(locale, "What are you shipping?")}
                value={cargoType}
                onChange={(e) => setCargoType(e.target.value)}
                className="h-14 rounded-2xl text-base font-medium"
              >
                <option value="" disabled>
                  {t(locale, "Choose your goods")}
                </option>
                {cargoTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </NativeSelect>
            </Step>

            <Step n={2} title={t(locale, "How much is there?")}>
              <div className="mb-3 flex flex-wrap gap-2">
                {(
                  [
                    ["cbm", "I know the CBM"],
                    ["boxes", "Use my box sizes"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setHow(value)}
                    className={cn(
                      "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                      how === value ? "border-brand bg-brand/10 text-brand" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {t(locale, label)}
                  </button>
                ))}
              </div>

              {how === "cbm" ? (
                <div className="flex h-16 items-center gap-2 rounded-2xl border bg-background px-2 focus-within:border-brand">
                  <button
                    type="button"
                    onClick={() => step(-0.5)}
                    aria-label={t(locale, "Less")}
                    className="grid size-11 place-items-center rounded-xl bg-secondary hover:bg-accent"
                  >
                    <Minus className="size-4" />
                  </button>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.1"
                    value={cbmTyped}
                    onChange={(e) => setCbmTyped(e.target.value)}
                    aria-label="CBM"
                    className="tnum min-w-0 flex-1 bg-transparent text-center font-display text-3xl font-bold outline-none"
                  />
                  <span className="text-sm font-semibold text-muted-foreground">CBM</span>
                  <button
                    type="button"
                    onClick={() => step(0.5)}
                    aria-label={t(locale, "More")}
                    className="grid size-11 place-items-center rounded-xl bg-secondary hover:bg-accent"
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-[1fr_1fr_1fr_0.8fr_auto] gap-2 px-1 text-xs font-medium text-muted-foreground">
                    <span>{t(locale, "Length cm")}</span>
                    <span>{t(locale, "Width cm")}</span>
                    <span>{t(locale, "Height cm")}</span>
                    <span>{t(locale, "Boxes")}</span>
                    <span className="w-8" />
                  </div>
                  {lines.map((line) => (
                    <div key={line.id} className="grid grid-cols-[1fr_1fr_1fr_0.8fr_auto] items-center gap-2">
                      {(["length", "width", "height", "boxes"] as const).map((field) => (
                        <input
                          key={field}
                          type="number"
                          inputMode="decimal"
                          min="0"
                          value={line[field]}
                          placeholder={field === "boxes" ? "1" : "0"}
                          aria-label={field}
                          onChange={(e) =>
                            setLines((rows) =>
                              rows.map((row) => (row.id === line.id ? { ...row, [field]: e.target.value } : row))
                            )
                          }
                          className="tnum h-12 min-w-0 rounded-xl border bg-background px-3 text-base outline-none focus:border-brand"
                        />
                      ))}
                      <button
                        type="button"
                        disabled={lines.length === 1}
                        onClick={() => setLines((rows) => rows.filter((row) => row.id !== line.id))}
                        aria-label={t(locale, "Remove")}
                        className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary disabled:opacity-30"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={() =>
                        setLines((rows) => [
                          ...rows,
                          { id: nextId.current++, length: "", width: "", height: "", boxes: "1" },
                        ])
                      }
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline"
                    >
                      <Plus className="size-4" />
                      {t(locale, "Another box size")}
                    </button>
                    <span className="tnum inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Ruler className="size-4" />
                      {boxCbm.toFixed(3)} CBM
                    </span>
                  </div>
                </div>
              )}
            </Step>
          </div>
        ) : (
          <div className="mt-7">
            <Step n={1} title={t(locale, "Which container?")}>
              <div className="grid gap-3 sm:grid-cols-2">
                {containers.map((c) => (
                  <button
                    key={c.cargoType}
                    type="button"
                    onClick={() => setContainer(c.cargoType)}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors",
                      container === c.cargoType ? "border-brand bg-brand/5" : "hover:border-brand/50"
                    )}
                  >
                    <span className="grid size-11 place-items-center rounded-xl bg-brand text-brand-foreground">
                      <Container className="size-5" />
                    </span>
                    <span className="font-display text-lg font-bold">{c.cargoType}</span>
                  </button>
                ))}
              </div>
            </Step>
          </div>
        )}

        {/* How to measure, where the column would otherwise run out. */}
        <div className="mt-8 flex items-center gap-4 rounded-2xl bg-surface-2 p-4 lg:mt-auto">
          <svg aria-hidden viewBox="0 0 64 52" className="h-12 w-14 shrink-0 text-brand">
            <path d="M8 18 32 8l24 10v22L32 50 8 40Z" fill="currentColor" opacity=".12" />
            <path d="M8 18 32 28l24-10M32 28v22M8 18 32 8l24 10v22L32 50 8 40Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            <path d="M4 22v18M60 22v18M36 4h18" stroke="#f4611f" strokeWidth="2" strokeLinecap="round" strokeDasharray="2 3" />
          </svg>
          <p className="text-sm text-muted-foreground">
            {service === "FCL"
              ? t(locale, "A full container is one price, whatever you fill it with.")
              : t(locale, "Measure one box — length, width and height in centimetres — then count how many boxes are that size.")}
          </p>
        </div>
      </div>

      {/* ------------------------------------------------------ The answer */}
      <div aria-live="polite" className="relative isolate flex flex-col overflow-hidden bg-ink p-6 text-white sm:p-8">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_90%_0%,hsl(var(--marine)/0.3),transparent_60%),radial-gradient(ellipse_at_0%_100%,hsl(var(--signal)/0.22),transparent_55%)]"
        />

        {service === "FCL" ? (
          <div className="my-auto">
            <p className="text-sm text-white/60">{chosenContainer?.cargoType}</p>
            <p className="tnum mt-1 font-display text-5xl font-extrabold tracking-tight">
              {chosenContainer?.price ?? "—"}
            </p>
            <p className="mt-2 text-sm text-white/60">{t(locale, "The whole container, Guangzhou to Dar es Salaam.")}</p>
            <Link
              href="/book?service=FULL_CONTAINER"
              className="track-go mt-8 inline-flex h-12 items-center gap-2 rounded-full px-6 text-sm font-semibold"
            >
              {t(locale, "Book this container")}
              <ArrowRight className="size-4" />
            </Link>
          </div>
        ) : (
          <>
            {/* How full a 20ft container this would be, drawn. */}
            <div aria-hidden className="relative h-20 overflow-hidden rounded-xl border border-white/15 bg-white/[0.04]">
              <div
                className="absolute inset-y-0 left-0 bg-[repeating-linear-gradient(90deg,#f4611f_0_14px,#dc4e12_14px_16px)] transition-[width] duration-700 ease-out"
                style={{ width: `${Math.max(fill, cbm > 0 ? 3 : 0)}%` }}
              />
              <div className="absolute inset-0 bg-[repeating-linear-gradient(90deg,transparent_0_22px,rgba(255,255,255,0.08)_22px_24px)]" />
              <span className="tnum absolute right-3 top-2 text-xs font-semibold text-white/80">
                {cbm.toFixed(2)} CBM
              </span>
              <span className="absolute bottom-2 right-3 text-[0.7rem] text-white/50">
                {fill >= 100 ? t(locale, "More than a 20ft container") : `${Math.round(fill)}% ${t(locale, "of a 20ft container")}`}
              </span>
            </div>

            <div className="mt-7 flex-1">
              {!cargoType ? (
                <>
                  <p className="font-display text-3xl font-bold tracking-tight">{t(locale, "Your price")}</p>
                  <p className="mt-2 text-white/65">{t(locale, "Choose your goods and it appears here.")}</p>
                </>
              ) : cbm <= 0 ? (
                <p className="text-white/65">{t(locale, "Enter how much you have.")}</p>
              ) : answer?.error ? (
                <p className="text-orange-200">{answer.error}</p>
              ) : answer?.estimate?.kind === "quote-required" ? (
                <>
                  <p className="font-display text-3xl font-bold tracking-tight">{t(locale, "We will price this for you")}</p>
                  <Link href="/quote" className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-900">
                    {t(locale, "Get a quote")}
                    <ArrowRight className="size-4" />
                  </Link>
                </>
              ) : (
                <div className={cn("transition-opacity", (pending || !priced) && "opacity-60")}>
                  <p className="flex items-center gap-2 text-sm text-white/60">
                    {t(locale, "Estimated price")}
                    {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  </p>
                  <p className="tnum mt-1 font-display text-5xl font-extrabold tracking-tight">
                    {priced ? priced.totalTzs ?? priced.total : "…"}
                  </p>
                  {priced?.totalTzs ? <p className="tnum mt-1 text-lg text-white/70">{priced.total}</p> : null}

                  {priced ? (
                    <dl className="tnum mt-6 space-y-2 rounded-2xl bg-white/[0.06] p-4 text-sm">
                      <Row label={t(locale, "Rate for") + " " + cargoType} value={`${priced.currency} ${Number(priced.rate).toLocaleString("en-US")} / CBM`} strong />
                      <Row
                        label={t(locale, "Volume charged")}
                        value={`${priced.billableCbm ?? priced.measuredCbm} CBM${priced.minimumApplied ? ` (${t(locale, "minimum")})` : ""}`}
                      />
                      {priced.lines.map((line) => (
                        <Row key={line.label} label={t(locale, line.label)} value={line.amount} />
                      ))}
                    </dl>
                  ) : null}
                </div>
              )}
            </div>

            {priced ? (
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href={`/book?service=SHARED_CARGO&commodity=${encodeURIComponent(cargoType)}&cbm=${encodeURIComponent(priced.measuredCbm)}`}
                  className="track-go inline-flex h-12 items-center gap-2 rounded-full px-6 text-sm font-semibold"
                >
                  {t(locale, "Book this shipment")}
                  <ArrowRight className="size-4" />
                </Link>
              </div>
            ) : null}
            <p className="mt-5 text-xs text-white/45">
              {t(locale, "An estimate. The bill is worked out from what our warehouse measures.")}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-3 flex items-center gap-3 font-display text-lg font-bold tracking-tight">
        <span className="tnum grid size-8 place-items-center rounded-full bg-gradient-to-br from-signal to-orange-600 text-sm text-white">
          {n}
        </span>
        {title}
      </p>
      {children}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="min-w-0 truncate text-white/60">{label}</dt>
      <dd className={cn("shrink-0", strong && "font-semibold text-white")}>{value}</dd>
    </div>
  );
}
