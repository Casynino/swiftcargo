"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { formDate } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { formMessage } from "@/lib/safe-error";
import { DEFAULT_TRANSIT_DAYS } from "@/lib/sailing-schedule";
import { authorize } from "@/lib/session";

export type ActionState = { error?: string; ok?: string };

const warehouseSchema = z.object({
  code: z.string().trim().min(1, "A short code, please."),
  name: z.string().trim().min(2, "Name it."),
  kind: z.enum(["CHINA", "TANZANIA"]),
  addressLocal: z.string().trim().optional(),
  addressEnglish: z.string().trim().optional(),
  city: z.string().trim().optional(),
  country: z.string().trim().optional(),
  phone: z.string().trim().optional(),
});

export async function upsertWarehouse(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("warehouse.manage");

  const id = String(formData.get("warehouseId") ?? "");
  const parsed = warehouseSchema.safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
    kind: formData.get("kind") || "CHINA",
    addressLocal: formData.get("addressLocal") || undefined,
    addressEnglish: formData.get("addressEnglish") || undefined,
    city: formData.get("city") || undefined,
    country: formData.get("country") || undefined,
    phone: formData.get("phone") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const data = {
    ...parsed.data,
    code: parsed.data.code.toUpperCase(),
    addressLocal: parsed.data.addressLocal || null,
    addressEnglish: parsed.data.addressEnglish || null,
    city: parsed.data.city || null,
    country: parsed.data.country || null,
    phone: parsed.data.phone || null,
  };

  /* Asked on an edit as well as on an add: renaming a code onto another
     warehouse's is a unique-constraint failure, which reaches the form as an
     error page rather than a sentence. */
  const existing = await prisma.warehouse.findUnique({
    where: { code: data.code },
    select: { id: true },
  });
  if (existing && existing.id !== id) return { error: "That code is already in use." };

  if (id) {
    const found = await prisma.warehouse.findUnique({ where: { id }, select: { id: true } });
    if (!found) return { error: "That warehouse no longer exists." };
    await prisma.warehouse.update({ where: { id }, data });
  } else {
    await prisma.warehouse.create({ data });
  }

  await recordAudit({
    actor,
    action: id ? "warehouse.update" : "warehouse.create",
    entity: "Warehouse",
    entityId: id || null,
    summary: `${id ? "Updated" : "Added"} warehouse ${data.name} (${data.code})`,
  });

  revalidatePath("/app/admin/warehouses");
  return { ok: "Saved." };
}

const SAILING_STATUSES = [
  "OPEN_FOR_BOOKING",
  "CUTOFF_APPROACHING",
  "CLOSED",
  "DEPARTED",
  "IN_TRANSIT",
  "ARRIVED",
  "DELAYED",
  "CANCELLED",
] as const;

const scheduleSchema = z.object({
  /* The Monday of the generated week this row stands in for. Blank makes it an
     extra sailing the weekly rule does not describe. */
  weekOf: z.string().trim().optional(),
  origin: z.string().trim().max(120).optional(),
  destination: z.string().trim().max(120).optional(),
  vessel: z.string().trim().optional(),
  voyage: z.string().trim().optional(),
  shippingLine: z.string().trim().optional(),
  cargoDeadline: z.string().min(1, "When does cargo close?"),
  loadingDate: z.string().trim().optional(),
  departureDate: z.string().min(1, "When does it sail?"),
  transitDays: z.coerce
    .number()
    .int("Whole days.")
    .min(1, "A voyage takes at least a day.")
    .max(120, "Check the transit time."),
  estimatedArrival: z.string().trim().optional(),
  status: z.enum(SAILING_STATUSES).optional(),
  notes: z.string().trim().max(500).optional(),
  published: z.boolean().optional(),
});

/**
 * OVERRIDE ONE WEEK OF THE SAILING SCHEDULE.
 *
 * The public page is generated from the weekly rule — see
 * lib/sailing-schedule.ts — so nothing has to be published for the website to
 * be right. A row saved here is the week that DIFFERS: one that slipped, one
 * with a vessel worth naming, one nobody is sailing. `weekOf` says which
 * generated week it stands in for, and unticking "show on the public website"
 * takes that week off the page altogether.
 *
 * Deliberately not derived from a container: a sailing is announced weeks
 * before a box exists.
 */
export async function upsertSchedule(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("content.manage");

  const id = String(formData.get("scheduleId") ?? "");
  const parsed = scheduleSchema.safeParse({
    weekOf: formData.get("weekOf") || undefined,
    origin: formData.get("origin") || undefined,
    destination: formData.get("destination") || undefined,
    vessel: formData.get("vessel") || undefined,
    voyage: formData.get("voyage") || undefined,
    shippingLine: formData.get("shippingLine") || undefined,
    cargoDeadline: formData.get("cargoDeadline"),
    loadingDate: formData.get("loadingDate") || undefined,
    departureDate: formData.get("departureDate"),
    transitDays: formData.get("transitDays") || DEFAULT_TRANSIT_DAYS,
    estimatedArrival: formData.get("estimatedArrival") || undefined,
    status: formData.get("status") || undefined,
    notes: formData.get("notes") || undefined,
    published: formData.get("published") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const d = parsed.data;

  let dates: { cargoDeadline: Date; departureDate: Date; weekOf: Date | null };
  let loadingDate: Date | null;
  try {
    dates = {
      cargoDeadline: formDate(d.cargoDeadline, "cargo deadline")!,
      departureDate: formDate(d.departureDate, "departure date")!,
      weekOf: formDate(d.weekOf, "sailing week"),
    };
    loadingDate = formDate(d.loadingDate, "loading day");
  } catch (error) {
    return { error: formMessage(error, "Check the dates.") };
  }

  if (dates.departureDate < dates.cargoDeadline) {
    return { error: "A ship cannot leave before the cargo deadline." };
  }

  /* An arrival typed by hand wins; otherwise it is departure plus the days at
     sea, which is the same arithmetic the public page does. */
  const arrival =
    formDate(d.estimatedArrival, "arrival") ??
    new Date(dates.departureDate.getTime() + d.transitDays * 24 * 60 * 60 * 1000);

  const data = {
    weekOf: dates.weekOf,
    origin: d.origin || "Guangzhou",
    destination: d.destination || "Dar es Salaam",
    vessel: d.vessel || null,
    voyage: d.voyage || null,
    shippingLine: d.shippingLine || null,
    cargoDeadline: dates.cargoDeadline,
    loadingDate: loadingDate ?? dates.cargoDeadline,
    departureDate: dates.departureDate,
    transitDays: d.transitDays,
    estimatedArrival: arrival,
    status: d.status ?? "OPEN_FOR_BOOKING",
    notes: d.notes || null,
    published: d.published ?? true,
  };

  try {
    if (id) {
      await prisma.shipmentSchedule.update({ where: { id }, data });
    } else {
      await prisma.shipmentSchedule.create({ data });
    }
  } catch (error) {
    /* One row per week, enforced by the database: two people cannot publish two
       versions of the same Monday. */
    return {
      error: formMessage(error, "That sailing week has already been published. Edit the one that is there."),
    };
  }

  await recordAudit({
    actor,
    action: id ? "schedule.update" : "schedule.create",
    entity: "ShipmentSchedule",
    entityId: id || null,
    summary: `${id ? "Updated" : "Published"} sailing ${d.vessel ?? "TBC"} departing ${d.departureDate} (${data.status})`,
  });

  revalidatePath("/app/admin/content");
  revalidatePath("/schedule");
  revalidatePath("/");
  return { ok: "Saved. It is live on the website." };
}

export async function deleteSchedule(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("content.manage");
  const id = String(formData.get("scheduleId") ?? "");

  /* Two people tidying the same list press the same bin; the second is told,
     rather than shown an error page. */
  const removed = await prisma.shipmentSchedule.deleteMany({ where: { id } });
  if (removed.count === 0) return { error: "That sailing was already removed." };
  await recordAudit({
    actor,
    action: "schedule.delete",
    entity: "ShipmentSchedule",
    entityId: id,
    summary: "Removed a published sailing",
  });

  revalidatePath("/app/admin/content");
  revalidatePath("/schedule");
  return { ok: "Removed." };
}
