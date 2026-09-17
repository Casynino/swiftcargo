import Link from "next/link";
import { SearchX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";

/**
 * Inside the portal, a record that is not on this customer's account.
 *
 * Deliberately the same answer whether the record does not exist or belongs to
 * somebody else — telling the two apart would confirm which references are real.
 */
export default function PortalNotFound() {
  const locale = DEFAULT_LOCALE;
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <span className="inline-flex size-14 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        <SearchX className="size-7" />
      </span>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">
        {t(locale, "We cannot find that on your account")}
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        {t(locale, "The link may be old, or it may belong to a different account. If you think something is missing, send us a message.")}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link href="/portal">{t(locale, "My cargo")}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/portal/messages">{t(locale, "Messages")}</Link>
        </Button>
      </div>
    </div>
  );
}
