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
}: {
  className?: string;
  showWordmark?: boolean;
  size?: number;
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
          <span className="text-[15px] font-bold uppercase tracking-[0.14em] text-navy-700 dark:text-navy-100">
            Swift Cargo
          </span>
          <span className="mt-0.5 text-[10px] font-medium tracking-wide text-muted-foreground">
            On time, Every time
          </span>
        </span>
      ) : null}
    </span>
  );
}
