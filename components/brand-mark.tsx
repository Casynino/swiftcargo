import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * The company mark.
 *
 * The wordmark is set in text rather than baked into the image so it stays
 * legible at any size, remains selectable, and reads correctly to a screen
 * reader — the PNG carries only the ship.
 */
export function BrandMark({
  className,
  showWordmark = true,
  size = 36,
  compact = false,
}: {
  className?: string;
  showWordmark?: boolean;
  size?: number;
  /** A narrower wordmark, for the phone drawer. */
  compact?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Image
        src="/brand/swift-cargo.png"
        alt=""
        width={size}
        height={size}
        priority
        className="h-auto w-auto object-contain"
        style={{ width: size, height: size }}
      />
      {showWordmark ? (
        <span className="flex flex-col leading-none">
          <span className={cn("whitespace-nowrap font-bold uppercase text-navy-700 dark:text-navy-100", compact ? "text-[13px] tracking-[0.1em]" : "text-[15px] tracking-[0.14em]")}>
            Swift Cargo
          </span>
          <span className={cn("mt-0.5 whitespace-nowrap font-medium tracking-wide text-muted-foreground", compact ? "text-[9px]" : "text-[10px]")}>
            On time, Every time
          </span>
        </span>
      ) : null}
    </span>
  );
}
