import { notFound, redirect } from "next/navigation";

import { can } from "@/lib/rbac";
import { resolveScanToken } from "@/lib/scan";
import { currentUser } from "@/lib/session";

/**
 * WHERE A SCANNED LABEL LANDS.
 *
 * The same sticker is scanned by two different people and has to answer both:
 * a clerk in the warehouse wants the whole record — measurements, photos,
 * container, and whether it is paid — and a customer with a phone wants their
 * tracking page. Who is holding the phone decides, and the session is what says
 * who that is.
 *
 * A pickup note carries a code too, and the Dar counter scans it with the
 * customer standing there. A live note takes the counter straight to the
 * pickup list for that consignment, where the handover is computed and done;
 * a spent or withdrawn note opens the record, which says so.
 *
 * The token is looked up, never trusted as an identifier the caller composed:
 * it resolves to exactly one box or nothing. A customer signed in to the portal
 * is sent to the public page rather than the staff record, because their gate is
 * their own customerId and a URL is not an authority.
 */
export default async function ScannedLabelPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token: raw } = await params;
  const token = decodeURIComponent(raw);

  const scanned = await resolveScanToken(token);
  if (!scanned) notFound();

  const user = await currentUser();
  const isStaff = Boolean(user && user.role !== "CUSTOMER");

  if (!isStaff) redirect(`/track/${scanned.reference}`);

  if (scanned.pickupNote?.status === "ACTIVE" && can(user!.role, "release.execute")) {
    redirect(`/app/release?q=${encodeURIComponent(scanned.reference)}`);
  }
  redirect(`/app/cargo/${scanned.cargoId}`);
}
