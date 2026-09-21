import type { Metadata } from "next";

import { ContainerForm } from "@/components/app/container-form";
import { PageHeader } from "@/components/app/page-header";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { nextOpenSailing, publicSailings } from "@/lib/sailing-schedule";
import { requirePermission } from "@/lib/session";

import { primeLocale, T } from "@/lib/server-t";
export const metadata: Metadata = { title: "Open a container" };

export default async function NewContainerPage() {
  await primeLocale();
  await requirePermission("container.create");

  /*
    A PEEK AT THE COUNTER, NOT A CLAIM ON IT.

    Read only to show what the next container will be called. The number is
    actually minted inside the transaction that creates it, so two clerks
    opening a box at the same moment still get different references — this
    preview may be one behind by the time they press the button, and that is
    the honest cost of not reserving a number nobody may use.
  */
  const now = new Date();
  const counter = await prisma.counter.findUnique({
    where: { key: "container" },
    select: { value: true },
  });
  const nextReference = `SWC${String(now.getFullYear()).slice(-2)}M${String(
    now.getMonth() + 1
  ).padStart(2, "0")}C${(counter?.value ?? 0) + 1}`;

  /* The same answer the action reaches when the box is opened. */
  const sailing = nextOpenSailing(await publicSailings({ count: 3 }));
  const deadline = sailing ? formatDate(sailing.cargoDeadline) : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title={T("Open a container")}
        description={T("It is numbered for you, and a voyage is created alongside it. The shipping line's own box number and the seal are recorded later, when the container is sealed.")}
        back={{ href: "/app/containers", label: "Containers" }}
      />
      <ContainerForm nextReference={nextReference} deadline={deadline} />
    </div>
  );
}
