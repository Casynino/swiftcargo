"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A password field with an eye to show what was typed.
 *
 * On a phone a password is typed blind with a thumb, and one wrong letter
 * costs a whole sign-in. Seeing it before pressing Sign in is cheaper than a
 * reset. Hidden by default, and the eye is a plain button outside the tab
 * order's way: it never submits the form.
 */
const PasswordInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<"input">, "type">
>(({ className, ...props }, ref) => {
  const t = useT();
  const [shown, setShown] = React.useState(false);
  const label = shown ? t("Hide password") : t("Show password");

  return (
    <div className="relative">
      <Input
        ref={ref}
        type={shown ? "text" : "password"}
        className={cn("pr-11", className)}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        {...props}
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={label}
        aria-pressed={shown}
        title={label}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
});
PasswordInput.displayName = "PasswordInput";

export { PasswordInput };
