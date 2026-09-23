import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { ScanReleaseWorkbench, type ReleaseCandidate } from "@/components/app/scan-release-workbench";
import { resolveForRelease } from "@/lib/actions/scan-release";
import { prisma } from "@/lib/prisma";
import { checkRelease, RELEASE_INCLUDE } from "@/lib/release";
import { requirePermission } from "@/lib/session";

import { primeLocale, T } from "@/lib/server-t";
export const metadata: Metadata = { title: "Scan & release" };

/**
 * WHERE A SCANNED CARTON LANDS, AND WHERE THE JOB FINISHES.
 *
 * There is no screen between the scan and the handover. A clerk points a
 * phone at the sticker on a box and this page opens with the customer, the
 * cargo, the money (where the viewer may see money) and the release form
 * already on it — or with the reason it cannot go. `cargo.scan` and
 * `release.execute` are held by exactly the same roles here, so nobody who
 * cannot release is ever shown a page that pretends otherwise.
 *
 * A typed tracking number does the same job as a camera read — see
 * lib/actions/scan-release.ts — because a label that will not scan, or a
 * consignment with no printed pickup note at all, must still be reachable
 * from this one screen rather than sending the clerk somewhere else.
 */
export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  await primeLocale();
  await requirePermission("cargo.scan");
  const { code } = await searchParams;

  /*
    A CODE IN THE URL IS A PICK, NOT A SCAN.

    The pickup list's own "Release" button lands here with ?code= set to the
    tracking number — a clerk chose this consignment from a list, they did not
    read it off a box. It is resolved through the very same door a camera read
    or a typed number uses, so the queue and the counter can never disagree
    about what a held or short-shipped consignment looks like.
  */
  const opened = code ? await resolveForRelease(code) : null;

  /*
    THE BY-HAND FALLBACK.

    Behind a disclosure, so it never competes with the scanner — this screen
    exists to answer a scan in under a second, not to be browsed. It lists
    everything still on the Dar floor waiting to go, cleared or not, because a
    clerk hunting for an unreadable label needs to find the consignment
    whether or not Finance has issued its paper yet.
  */
  const candidates = await prisma.cargo.findMany({
    where: { deletedAt: null, status: { in: ["RECEIVED_DAR", "READY_FOR_RELEASE"] } },
    orderBy: { updatedAt: "asc" },
    take: 100,
    include: {
      ...RELEASE_INCLUDE,
      receiver: { select: { fullName: true, phone: true } },
    },
  });

  const list: ReleaseCandidate[] = candidates.map((item) => ({
    id: item.id,
    reference: item.reference,
    customerName: item.receiver.fullName,
    customerPhone: item.receiver.phone,
    packages: item.darReceiving?.packagesCount ?? null,
    cleared: checkRelease(item).ok,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={T("Scan & release")}
        description={T("Scan the box. Everything you need to hand it over is on this screen.")}
      />
      <ScanReleaseWorkbench
        candidates={list}
        initial={opened?.ok ? opened.data : null}
        initialError={opened && !opened.ok ? opened.error : null}
      />
    </div>
  );
}
