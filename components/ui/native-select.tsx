import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * A plain <select>.
 *
 * Deliberately not the Radix one for forms a warehouse fills in on a phone: the
 * native picker is the control the operating system already knows how to show,
 * it works with one thumb, and it does not need JavaScript to have loaded.
 */
const NativeSelect = React.forwardRef<HTMLSelectElement, React.ComponentProps<"select">>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
);
NativeSelect.displayName = "NativeSelect";

export { NativeSelect };
