"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  nextBookingReference,
  nextPickupReference,
  nextQuoteReference,
} from "@/lib/ids";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import { notifyStaff, staffInDepartment } from "@/lib/notify";
import { prisma } from "@/lib/prisma";
import { SERVICE_LABEL } from "@/lib/constants";
import { clientAddress, hit } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { authorize, currentUser, type SessionUser } from "@/lib/session";

export type ActionState = { error?: string; ok?: string; reference?: string };

/**
 * REQUESTS OFF THE WEBSITE ARE NOT BOOKINGS.
 *
 * Everything here is typed by somebody who is not standing in our warehouse, so
 * none of it becomes cargo, a container or a confirmed pickup. It lands as a
 * SUBMITTED request for a member of staff to act on, which is what stops the
 * operation from having to trust a figure a stranger entered.
 *
 * These three are the only writes a stranger can make, which is why they are
 * the only server actions that do not call `authorize`: there is nobody to
 * authorise. What stands in for it is below — a field only a script fills in,
 * a per-address limit, a per-phone limit every server instance shares because
 * it is read from the requests themselves, and a second press of Send returning
 * the first request instead of making another. Support works this queue by
 * hand, and a queue full of junk is a queue where the real enquiry is missed.
 */

const L = (english: string) => t(DEFAULT_LOCALE, english);

/* Per address, per server instance. Sized for a shared office connection. */
const PER_ADDRESS = 8;
const ADDRESS_WINDOW_MS = 60 * 60 * 1000;
/* Per phone number, across all three forms, read from the database. */
const PER_PHONE_PER_DAY = 6;
/* A second submission of the same thing inside this window is the same request. */
const DUPLICATE_WINDOW_MS = 15 * 60 * 1000;

/** The field a person never sees. See the form. */
const TRAP_FIELD = "website";

function normalisePhone(raw: string) {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  if (digits.startsWith("255")) return `+${digits}`;
  if (digits.startsWith("0")) return `+255${digits.slice(1)}`;
  return digits;
}

const name = z.string().trim().min(2, L("Your name, please.")).max(120, L("That name is too long."));
const phone = z
  .string()
  .trim()
  .max(40, L("That phone number is too long."))
  .transform(normalisePhone)
  .refine((v) => /^\+?\d{9,15}$/.test(v), L("Enter a phone number we can call, with the country code if outside Tanzania."));
const email = z.string().trim().toLowerCase().max(200).email(L("That is not an email address.")).optional().or(z.literal(""));
const shortText = z.string().trim().max(200, L("Keep that under 200 characters.")).optional();
const longText = z.string().trim().max(2000, L("Keep that under 2,000 characters.")).optional();
const volume = z.coerce.number().min(0, L("Volume cannot be negative.")).max(10_000, L("Check the volume.")).optional();
const weight = z.coerce.number().min(0, L("Weight cannot be negative.")).max(1_000_000, L("Check the weight.")).optional();
const count = z.coerce.number().int(L("Use a whole number.")).min(0).max(1_000_000).optional();
const money = z.coerce.number().min(0, L("That cannot be negative.")).max(1_000_000_000).optional();
/* A date the customer names. Today or later; a readiness date in the past is a
   typing slip, and a collection cannot be arranged for last Tuesday. */
const futureDate = z
  .string()
  .trim()
  .optional()
  .refine(
    (v) => !v || (!Number.isNaN(Date.parse(v)) && Date.parse(v) >= Date.now() - 24 * 60 * 60 * 1000),
    L("Choose a date from today onwards.")
  );

type Kind = "quote" | "pickup" | "booking";

/**
 * Everything a public form checks before it writes.
 *
 * Returns a state to send straight back, or null to carry on.
 */
async function screen(formData: FormData, phoneNumber: string): Promise<ActionState | null> {
  /* A script fills in every field it finds. Told it succeeded, so it has no
     reason to try harder; nothing is written. */
  if (String(formData.get(TRAP_FIELD) ?? "").trim() !== "") {
    return { ok: L("Thank you. We will be in touch.") };
  }

  const address = await clientAddress();
  if (!hit(`request:${address}`, PER_ADDRESS, ADDRESS_WINDOW_MS).ok) {
    return { error: L("We have had a lot of requests from your connection. Please call or WhatsApp us instead.") };
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const where = { contactPhone: phoneNumber, createdAt: { gte: since } };
  const [quotes, pickups, bookings] = await Promise.all([
    prisma.quoteRequest.count({ where }),
    prisma.pickupRequest.count({ where }),
    prisma.containerBooking.count({ where }),
  ]);
  if (quotes + pickups + bookings >= PER_PHONE_PER_DAY) {
    return { error: L("We already have several requests from this number today. Our team will call you.") };
  }
  return null;
}

function duplicate(kind: Kind, reference: string): ActionState {
  const note =
    kind === "booking"
      ? L("We already have this booking request.")
      : kind === "pickup"
        ? L("We already have this pickup request.")
        : L("We already have this quote request.");
  return { ok: `${note} ${L("Your reference is")} ${reference}.`, reference };
}

/** A signed-in customer's own account, from the session and nothing else. */
async function sessionCustomerId() {
  const user = await currentUser();
  return user?.role === "CUSTOMER" ? user.customerId : null;
}

const quoteSchema = z.object({
  contactName: name,
  contactPhone: phone,
  contactEmail: email,
  service: z.enum(["LCL", "FCL"]),
  commodity: shortText,
  originCity: shortText,
  destination: shortText,
  estimatedCbm: volume,
  estimatedWeightKg: weight,
  hazardous: z.boolean().optional(),
  fragile: z.boolean().optional(),
  notes: longText,
});

export async function submitQuoteRequest(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = quoteSchema.safeParse({
    contactName: formData.get("contactName") ?? "",
    contactPhone: formData.get("contactPhone") ?? "",
    contactEmail: formData.get("contactEmail") || "",
    service: formData.get("service") || "LCL",
    commodity: formData.get("commodity") || undefined,
    originCity: formData.get("originCity") || undefined,
    destination: formData.get("destination") || undefined,
    estimatedCbm: formData.get("estimatedCbm") || undefined,
    estimatedWeightKg: formData.get("estimatedWeightKg") || undefined,
    hazardous: formData.get("hazardous") === "on",
    fragile: formData.get("fragile") === "on",
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? L("Check the form.") };
  }
  const data = parsed.data;

  const refused = await screen(formData, data.contactPhone);
  if (refused) return refused;

  const same = await prisma.quoteRequest.findFirst({
    where: {
      contactPhone: data.contactPhone,
      service: data.service,
      commodity: data.commodity || null,
      createdAt: { gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
    },
    select: { reference: true },
  });
  if (same) return duplicate("quote", same.reference);

  const customerId = await sessionCustomerId();

  const request = await prisma.$transaction(async (tx) => {
    const reference = await nextQuoteReference(tx);
    const created = await tx.quoteRequest.create({
      data: {
        reference,
        customerId,
        contactName: data.contactName,
        contactPhone: data.contactPhone,
        contactEmail: data.contactEmail || null,
        service: data.service,
        commodity: data.commodity || null,
        originCity: data.originCity || null,
        destination: data.destination || null,
        estimatedCbm: data.estimatedCbm ?? null,
        estimatedWeightKg: data.estimatedWeightKg ?? null,
        hazardous: data.hazardous ?? false,
        fragile: data.fragile ?? false,
        notes: data.notes || null,
      },
    });

    await recordAudit(
      {
        actor: null,
        action: "request.quote.create",
        entity: "QuoteRequest",
        entityId: created.id,
        summary: `${reference} raised on the website by ${data.contactName} — ${data.service}`,
      },
      tx
    );

    await notifyStaff(
      await staffInDepartment("CUSTOMER_SUPPORT", tx),
      {
        kind: "request.quote",
        title: `Quote request ${reference}`,
        body: `${data.contactName} · ${data.service}${data.estimatedCbm ? ` · ${data.estimatedCbm} CBM` : ""}`,
        href: "/app/support/requests",
      },
      tx
    );

    return created;
  });

  revalidatePath("/app/support/requests");
  return {
    ok: `${L("Thank you. Your reference is")} ${request.reference}. ${L("We will call you back with a price.")}`,
    reference: request.reference,
  };
}

/**
 * THE CHINA COLLECTION FORM.
 *
 * Everything the Guangzhou floor needs to find a factory and know what it is
 * looking at before it sends a van: who is asking, who to ask for at the gate,
 * where, when, and roughly what. Every figure on it is the customer's estimate
 * and stays an estimate — the counter measures when the boxes land, and nothing
 * here becomes a receiving record on its own.
 */
const pickupSchema = z.object({
  contactName: name,
  contactPhone: phone,
  contactWhatsapp: z.string().trim().max(40).optional(),
  contactEmail: email,
  supplierName: shortText,
  supplierContact: z.string().trim().max(120).optional(),
  pickupLocation: z
    .string()
    .trim()
    .min(3, L("Where are we collecting from?"))
    .max(300, L("Keep the address under 300 characters.")),
  city: shortText,
  preferredDate: futureDate,
  preferredTime: z.string().trim().max(60).optional(),
  commodity: shortText,
  cargoDescription: longText,
  packages: count,
  estimatedCbm: volume,
  estimatedWeightKg: weight,
  shippingMark: z.string().trim().max(120).optional(),
  notes: longText,
});

export async function submitPickupRequest(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = pickupSchema.safeParse({
    contactName: formData.get("contactName") ?? "",
    contactPhone: formData.get("contactPhone") ?? "",
    contactWhatsapp: formData.get("contactWhatsapp") || undefined,
    contactEmail: formData.get("contactEmail") || "",
    supplierName: formData.get("supplierName") || undefined,
    supplierContact: formData.get("supplierContact") || undefined,
    pickupLocation: formData.get("pickupLocation") ?? "",
    city: formData.get("city") || undefined,
    preferredDate: formData.get("preferredDate") || undefined,
    preferredTime: formData.get("preferredTime") || undefined,
    commodity: formData.get("commodity") || undefined,
    cargoDescription: formData.get("cargoDescription") || undefined,
    packages: formData.get("packages") || undefined,
    estimatedCbm: formData.get("estimatedCbm") || undefined,
    estimatedWeightKg: formData.get("estimatedWeightKg") || undefined,
    shippingMark: formData.get("shippingMark") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? L("Check the form.") };
  }
  const data = parsed.data;

  const refused = await screen(formData, data.contactPhone);
  if (refused) return refused;

  const same = await prisma.pickupRequest.findFirst({
    where: {
      contactPhone: data.contactPhone,
      pickupLocation: data.pickupLocation,
      createdAt: { gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
    },
    select: { reference: true },
  });
  if (same) return duplicate("pickup", same.reference);

  const customerId = await sessionCustomerId();

  const request = await prisma.$transaction(async (tx) => {
    const reference = await nextPickupReference(tx);
    const created = await tx.pickupRequest.create({
      data: {
        reference,
        customerId,
        contactName: data.contactName,
        contactPhone: data.contactPhone,
        contactWhatsapp: data.contactWhatsapp || null,
        contactEmail: data.contactEmail || null,
        supplierName: data.supplierName || null,
        supplierContact: data.supplierContact || null,
        pickupLocation: data.pickupLocation,
        city: data.city || null,
        preferredDate: data.preferredDate ? new Date(data.preferredDate) : null,
        preferredTime: data.preferredTime || null,
        commodity: data.commodity || null,
        cargoDescription: data.cargoDescription || null,
        packages: data.packages ?? null,
        estimatedCbm: data.estimatedCbm ?? null,
        estimatedWeightKg: data.estimatedWeightKg ?? null,
        shippingMark: data.shippingMark || null,
        notes: data.notes || null,
      },
    });

    /* The status and the desk fields are not in the create above and cannot be:
       every column a stranger may write is named there by hand, so a form field
       called "status" or "cargoId" reaches nothing. */
    await recordAudit(
      {
        actor: null,
        action: "request.pickup.create",
        entity: "PickupRequest",
        entityId: created.id,
        summary: `${reference} raised on the website by ${data.contactName} — ${data.pickupLocation}`,
      },
      tx
    );

    await notifyStaff(
      [
        ...(await staffInDepartment("CUSTOMER_SUPPORT", tx)),
        ...(await staffInDepartment("CHINA_WAREHOUSE", tx)),
      ],
      {
        kind: "request.pickup",
        title: `Pickup request ${reference}`,
        body: `${data.contactName} · ${data.pickupLocation}`,
        href: "/app/support/requests",
      },
      tx
    );

    return created;
  });

  revalidatePath("/app/support/requests");
  return {
    ok: `${L("Received. Your reference is")} ${request.reference}. ${L("Nothing is scheduled until we confirm it with you.")}`,
    reference: request.reference,
  };
}

/**
 * THE FOUR SERVICES, ON ONE FORM.
 *
 * A full container, loose cargo, something that needs looking at, and clearing
 * somebody else's box through Dar. They ask for different things — a clearance
 * job has no CBM and special cargo has no rate — so the schema is one shape
 * with the parts each service fills, and the checks below are what each service
 * genuinely cannot do without.
 *
 * `type` is the only field that decides anything. Everything to do with status,
 * price, assignment and conversion is absent from this schema and from the
 * create call, so a crafted post cannot approve its own request or name its own
 * price.
 */
const SERVICES = ["FULL_CONTAINER", "SHARED_CARGO", "SPECIAL_CARGO", "CUSTOMS_CLEARANCE"] as const;

const bookingSchema = z.object({
  type: z.enum(SERVICES),
  contactName: name,
  contactPhone: phone,
  contactEmail: email,

  originCity: shortText,
  pickupAddress: z.string().trim().max(300).optional(),
  destination: shortText,
  readinessDate: futureDate,
  supplierName: shortText,

  commodity: shortText,
  containerType: z
    .enum(["GP_20", "GP_40", "HQ_40", "HQ_45", "LCL_CONSOLIDATED"])
    .optional(),
  packages: count,
  quantity: count,
  dimensions: shortText,
  estimatedWeightKg: weight,
  estimatedCbm: volume,

  preferredShipment: shortText,
  preferredSailingDate: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || !Number.isNaN(Date.parse(v)), L("Choose a sailing from the list.")),

  dangerousGoods: z.boolean().optional(),
  fragile: z.boolean().optional(),
  perishable: z.boolean().optional(),
  handling: longText,

  portOfDischarge: shortText,
  shipmentRef: shortText,
  declaredValue: money,
  declaredValueCurrency: z.enum(["USD", "TZS"]).optional(),

  requirements: longText,
  termsAccepted: z.boolean(),
});

/** What each service cannot be sent without. */
function missingForService(data: z.infer<typeof bookingSchema>): string | null {
  if (data.type === "CUSTOMS_CLEARANCE") {
    if (!data.commodity) return L("Tell us what the cargo is so we can quote the clearance.");
    if (!data.portOfDischarge) return L("Which port is the cargo arriving at?");
    return null;
  }
  if (data.type === "FULL_CONTAINER" && !data.containerType) {
    return L("Which container size do you need?");
  }
  if (data.type === "SPECIAL_CARGO" && !data.dimensions && !data.handling) {
    return L("Tell us the dimensions, or how the cargo has to be handled.");
  }
  if (!data.commodity) return L("What are you shipping?");
  return null;
}

export async function submitBooking(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = bookingSchema.safeParse({
    type: formData.get("type") || "SHARED_CARGO",
    contactName: formData.get("contactName") ?? "",
    contactPhone: formData.get("contactPhone") ?? "",
    contactEmail: formData.get("contactEmail") || "",
    originCity: formData.get("originCity") || undefined,
    pickupAddress: formData.get("pickupAddress") || undefined,
    destination: formData.get("destination") || undefined,
    readinessDate: formData.get("readinessDate") || undefined,
    supplierName: formData.get("supplierName") || undefined,
    commodity: formData.get("commodity") || undefined,
    containerType: formData.get("containerType") || undefined,
    packages: formData.get("packages") || undefined,
    quantity: formData.get("quantity") || undefined,
    dimensions: formData.get("dimensions") || undefined,
    estimatedWeightKg: formData.get("estimatedWeightKg") || undefined,
    estimatedCbm: formData.get("estimatedCbm") || undefined,
    preferredShipment: formData.get("preferredShipment") || undefined,
    preferredSailingDate: formData.get("preferredSailingDate") || undefined,
    dangerousGoods: formData.get("dangerousGoods") === "on",
    fragile: formData.get("fragile") === "on",
    perishable: formData.get("perishable") === "on",
    handling: formData.get("handling") || undefined,
    portOfDischarge: formData.get("portOfDischarge") || undefined,
    shipmentRef: formData.get("shipmentRef") || undefined,
    declaredValue: formData.get("declaredValue") || undefined,
    declaredValueCurrency: formData.get("declaredValueCurrency") || undefined,
    requirements: formData.get("requirements") || undefined,
    termsAccepted: formData.get("termsAccepted") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? L("Check the form.") };
  }
  const data = parsed.data;

  if (!data.termsAccepted) {
    return { error: L("Please confirm you understand this is a request, not a confirmed booking.") };
  }
  const missing = missingForService(data);
  if (missing) return { error: missing };

  const refused = await screen(formData, data.contactPhone);
  if (refused) return refused;

  const same = await prisma.containerBooking.findFirst({
    where: {
      contactPhone: data.contactPhone,
      type: data.type,
      commodity: data.commodity || null,
      createdAt: { gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
    },
    select: { reference: true },
  });
  if (same) return duplicate("booking", same.reference);

  const customerId = await sessionCustomerId();

  const request = await prisma.$transaction(async (tx) => {
    const reference = await nextBookingReference(tx);
    const created = await tx.containerBooking.create({
      data: {
        reference,
        customerId,
        type: data.type,
        contactName: data.contactName,
        contactPhone: data.contactPhone,
        contactEmail: data.contactEmail || null,
        originCity: data.originCity || null,
        pickupAddress: data.pickupAddress || null,
        destination: data.destination || null,
        readinessDate: data.readinessDate ? new Date(data.readinessDate) : null,
        supplierName: data.supplierName || null,
        commodity: data.commodity || null,
        containerType: data.containerType ?? null,
        packages: data.packages ?? null,
        quantity: data.quantity ?? null,
        dimensions: data.dimensions || null,
        estimatedWeightKg: data.estimatedWeightKg ?? null,
        estimatedCbm: data.estimatedCbm ?? null,
        preferredShipment: data.preferredShipment || null,
        preferredSailingDate: data.preferredSailingDate
          ? new Date(data.preferredSailingDate)
          : null,
        dangerousGoods: data.dangerousGoods ?? false,
        fragile: data.fragile ?? false,
        perishable: data.perishable ?? false,
        handling: data.handling || null,
        portOfDischarge: data.portOfDischarge || null,
        shipmentRef: data.shipmentRef || null,
        declaredValue: data.declaredValue ?? null,
        declaredValueCurrency: data.declaredValueCurrency ?? "USD",
        requirements: data.requirements || null,
        termsAccepted: true,
      },
    });

    await recordAudit(
      {
        actor: null,
        action: "request.service.create",
        entity: "ContainerBooking",
        entityId: created.id,
        summary: `${reference} raised on the website by ${data.contactName} — ${SERVICE_LABEL[data.type]}`,
      },
      tx
    );

    await notifyStaff(
      await staffInDepartment("CUSTOMER_SUPPORT", tx),
      {
        kind: "request.booking",
        title: `Service request ${reference}`,
        body: `${data.contactName} · ${SERVICE_LABEL[data.type]}`,
        href: "/app/support/requests",
      },
      tx
    );

    return created;
  });

  revalidatePath("/app/support/requests");
  return {
    ok:
      data.type === "CUSTOMS_CLEARANCE"
        ? `${L("Thank you. Your reference is")} ${request.reference}. ${L("Swift Cargo will review the shipment and come back to you with a clearance quotation.")}`
        : `${L("Thank you. Your reference is")} ${request.reference}. ${L("This is a request, not a confirmed booking — we will be in touch to confirm space and price.")}`,
    reference: request.reference,
  };
}

/** Staff move a request along. */
export async function updateRequestStatus(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  let actor: SessionUser;
  try {
    actor = await authorize("request.manage");
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Not permitted." };
  }

  const kind = String(formData.get("kind") ?? "");
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  const notes = String(formData.get("staffNotes") ?? "").trim() || null;

  const allowed = [
    "SUBMITTED",
    "UNDER_REVIEW",
    "APPROVED",
    "SCHEDULED",
    "COMPLETED",
    "CANCELLED",
    "REJECTED",
  ];
  if (!allowed.includes(status)) return { error: "Not a valid status." };

  const data = { status: status as never, staffNotes: notes };

  let before: { reference: string; status: string } | null;
  if (kind === "pickup") {
    before = await prisma.pickupRequest.findUnique({ where: { id }, select: { reference: true, status: true } });
    if (before) await prisma.pickupRequest.update({ where: { id }, data });
  } else if (kind === "booking") {
    before = await prisma.containerBooking.findUnique({ where: { id }, select: { reference: true, status: true } });
    if (before) await prisma.containerBooking.update({ where: { id }, data });
  } else if (kind === "quote") {
    before = await prisma.quoteRequest.findUnique({ where: { id }, select: { reference: true, status: true } });
    /* A quote keeps its note as the response to the customer's enquiry; it has
       no staffNotes column, and writing one fails the whole save. */
    if (before) {
      await prisma.quoteRequest.update({
        where: { id },
        data: { status: status as never, responseNotes: notes },
      });
    }
  } else {
    return { error: "Unknown request type." };
  }
  if (!before) return { error: "That request no longer exists." };

  await recordAudit({
    actor,
    action: "request.update",
    entity: kind === "pickup" ? "PickupRequest" : kind === "booking" ? "ContainerBooking" : "QuoteRequest",
    entityId: id,
    summary: `${before.reference}: ${before.status} → ${status}${notes ? ` — ${notes}` : ""}`,
  });

  revalidatePath("/app/support/requests");
  return { ok: "Updated." };
}
