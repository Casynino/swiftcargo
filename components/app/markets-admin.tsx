"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Eye, EyeOff, Pencil, Plus } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  saveMarket,
  setMarketPublished,
  type MarketActionState,
} from "@/lib/actions/markets";
import { t, type Locale } from "@/lib/i18n";
import { parseMarketBody } from "@/lib/markets";

export type MarketRow = {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  category: string | null;
  summary: string | null;
  body: string | null;
  sortOrder: number;
  published: boolean;
};

/**
 * The markets directory, editable.
 *
 * One form, reused for add and edit — a separate "new market" page would be a
 * second place for the same fields to drift out of sync. Products and tips are
 * one-per-line textareas rather than repeatable field rows: whoever keeps this
 * is pasting a list, not operating a form builder.
 */
export function MarketsAdmin({
  markets,
  categories,
  locale,
}: {
  markets: MarketRow[];
  categories: string[];
  locale: Locale;
}) {
  const [state, action] = useActionState<MarketActionState, FormData>(saveMarket, {});
  const [editing, setEditing] = useState<MarketRow | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [toggleError, setToggleError] = useState<string | null>(null);

  /* The form keeps the row it was opened with, and React resets an action's
     form to its default values once the save lands — left open, it would show
     the old text under "Market saved." and a second save would put it back. */
  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      setEditing(null);
    }
  }, [state]);

  const startEdit = (market: MarketRow | null) => {
    setEditing(market);
    setOpen(true);
    setToggleError(null);
  };

  const toggle = (market: MarketRow) => {
    setToggleError(null);
    startTransition(async () => {
      const result = await setMarketPublished(market.id, !market.published);
      if (result.error) setToggleError(result.error);
    });
  };

  const body = parseMarketBody(editing?.body);

  return (
    <div className="space-y-6">
      <Card>
        <header className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div>
            <h2 className="font-semibold">
              {open
                ? editing
                  ? t(locale, "Edit market")
                  : t(locale, "Add a market")
                : t(locale, "Markets")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t(locale, "Published markets are what the support desk reads out to customers.")}
            </p>
          </div>
          <Button
            type="button"
            variant={open ? "ghost" : "default"}
            size="sm"
            onClick={() => (open ? setOpen(false) : startEdit(null))}
          >
            {open ? (
              t(locale, "Close")
            ) : (
              <>
                <Plus />
                {t(locale, "New market")}
              </>
            )}
          </Button>
        </header>

        {open ? (
          // Remounted on edit so defaultValue picks up the selected market.
          <form key={editing?.id ?? "new"} action={action} className="space-y-4 p-4">
            {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
            <FormMessage error={state.error} />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">{t(locale, "Market name")}</Label>
                <Input id="name" name="name" defaultValue={editing?.name} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">{t(locale, "City")}</Label>
                <Input
                  id="city"
                  name="city"
                  defaultValue={editing?.city ?? "Guangzhou, Guangdong"}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">{t(locale, "Kind of goods")}</Label>
                <Input
                  id="category"
                  name="category"
                  list="market-categories"
                  defaultValue={editing?.category ?? ""}
                  placeholder={t(locale, "Clothing and fashion")}
                  autoComplete="off"
                  required
                />
                <datalist id="market-categories">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
                <p className="text-xs text-muted-foreground">
                  {t(locale, "Markets are grouped under this on the support desk.")}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="district">{t(locale, "District")}</Label>
                <Input id="district" name="district" defaultValue={body.district} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="hours">{t(locale, "Opening hours")}</Label>
                <Input
                  id="hours"
                  name="hours"
                  defaultValue={body.hours}
                  placeholder={t(locale, "Roughly 09:00–17:00 daily")}
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="summary">{t(locale, "Best for — one line")}</Label>
                <Input
                  id="summary"
                  name="summary"
                  defaultValue={editing?.summary ?? ""}
                  placeholder={t(locale, "Clothing, shoes, bags and general merchandise")}
                  required
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="description">{t(locale, "Description")}</Label>
                <Textarea
                  id="description"
                  name="description"
                  rows={4}
                  defaultValue={body.description}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="products">{t(locale, "Products — one per line")}</Label>
                <Textarea
                  id="products"
                  name="products"
                  rows={6}
                  defaultValue={body.products.join("\n")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tips">{t(locale, "Tips for the customer — one per line")}</Label>
                <Textarea id="tips" name="tips" rows={6} defaultValue={body.tips.join("\n")} />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="verify">
                  {t(locale, "Warning to reconfirm")}{" "}
                  <span className="font-normal text-muted-foreground">{t(locale, "optional")}</span>
                </Label>
                <Input
                  id="verify"
                  name="verify"
                  defaultValue={body.verify}
                  placeholder={t(locale, "Opening days vary — confirm before travelling.")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sortOrder">{t(locale, "Position in the list")}</Label>
                <Input
                  id="sortOrder"
                  name="sortOrder"
                  inputMode="numeric"
                  defaultValue={String(editing?.sortOrder ?? markets.length)}
                />
              </div>
            </div>

            <SubmitButton pendingLabel={t(locale, "Saving…")}>
              {editing ? t(locale, "Save changes") : t(locale, "Add market")}
            </SubmitButton>
          </form>
        ) : null}
      </Card>

      {toggleError ? <FormMessage error={toggleError} /> : null}
      {!open && state.ok ? <FormMessage ok={state.ok} /> : null}

      {markets.length === 0 ? (
        <Card>
          <EmptyState
            icon="Store"
            title={t(locale, "No markets yet")}
            description={t(locale, "The first one you add appears on the support desk.")}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {markets.map((market) => {
            const parsed = parseMarketBody(market.body);
            return (
              <Card key={market.id} className={`p-5 ${market.published ? "" : "opacity-60"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold">{market.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {market.city}
                      {parsed.district ? ` · ${parsed.district}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {market.category ? <Badge tone="outline">{market.category}</Badge> : null}
                    {market.published ? null : (
                      <Badge tone="neutral">{t(locale, "unpublished")}</Badge>
                    )}
                  </div>
                </div>

                {market.summary ? (
                  <p className="mt-2 text-sm font-medium text-brand">{market.summary}</p>
                ) : null}
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {parsed.description}
                </p>
                <p className="tnum mt-2 text-xs text-muted-foreground">
                  {parsed.products.length} {t(locale, "products")} · {parsed.tips.length}{" "}
                  {t(locale, "tips")}
                </p>

                <div className="mt-4 flex gap-2 border-t pt-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      startEdit(market);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    <Pencil />
                    {t(locale, "Edit")}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => toggle(market)}
                  >
                    {market.published ? (
                      <>
                        <EyeOff />
                        {t(locale, "Unpublish")}
                      </>
                    ) : (
                      <>
                        <Eye />
                        {t(locale, "Publish")}
                      </>
                    )}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
