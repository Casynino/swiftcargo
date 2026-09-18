"use client";

import { useState } from "react";

import { normaliseTzPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";

/** The nine digits after +255, from whatever was typed or pasted. */
function nationalDigits(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("255")) return digits.slice(3, 12);
  if (digits.startsWith("0")) return digits.slice(1, 10);
  return digits.slice(0, 9);
}

function grouped(national: string) {
  return national.replace(/^(\d{3})(\d{0,3})(\d{0,3}).*$/, (_, a, b, c) =>
    [a, b, c].filter(Boolean).join(" ")
  ) || national;
}

/**
 * A TANZANIAN MOBILE NUMBER, AND NOTHING ELSE.
 *
 * The +255 is printed, not typed, so nobody has to know whether to start with
 * 0, 255 or +255 — and a number pasted from WhatsApp in any of those shapes
 * lands as the same nine digits. The form submits the full +255 number in
 * `name`; the server checks it again with the same rule.
 */
export function TzPhoneInput({
  name,
  id,
  defaultValue,
  required,
  autoFocus,
  className,
}: {
  name: string;
  id?: string;
  defaultValue?: string | null;
  required?: boolean;
  autoFocus?: boolean;
  className?: string;
}) {
  const [national, setNational] = useState(() => nationalDigits(defaultValue ?? ""));
  const [touched, setTouched] = useState(false);
  const full = national ? `+255${national}` : "";
  const valid = !!normaliseTzPhone(full);
  const showProblem = touched && national.length > 0 && !valid;

  return (
    <div className={className}>
      <div
        className={cn(
          "flex h-10 w-full items-center overflow-hidden rounded-md border bg-background text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
          showProblem && "border-destructive"
        )}
      >
        <span className="flex h-full shrink-0 items-center gap-1.5 border-r bg-secondary/60 px-3 font-medium">
          <span aria-hidden>🇹🇿</span>
          <span className="tnum">+255</span>
        </span>
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          autoFocus={autoFocus}
          required={required}
          aria-invalid={showProblem || undefined}
          aria-describedby={id ? `${id}-hint` : undefined}
          placeholder="712 345 678"
          value={grouped(national)}
          onChange={(event) => setNational(nationalDigits(event.target.value))}
          onBlur={() => setTouched(true)}
          className="tnum h-full min-w-0 flex-1 bg-transparent px-3 outline-none placeholder:text-muted-foreground"
        />
      </div>
      <input type="hidden" name={name} value={full} />
      <p
        id={id ? `${id}-hint` : undefined}
        className={cn("mt-1.5 text-xs", showProblem ? "text-destructive" : "text-muted-foreground")}
      >
        {showProblem
          ? "A Tanzanian mobile number has nine digits after +255 and starts with 6 or 7."
          : "Tanzanian numbers only, for now."}
      </p>
    </div>
  );
}
