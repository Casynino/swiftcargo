import { NextResponse } from "next/server";

import { sendStorageNotices } from "@/lib/storage-notices";

export const dynamic = "force-dynamic";

/**
 * Called once a day by the Vercel scheduler (vercel.json). With CRON_SECRET
 * set, Vercel sends it as a bearer token and nothing else may run this. The
 * job is safe to repeat — each customer is told once — but it is still not a
 * button for strangers.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  const result = await sendStorageNotices();
  return NextResponse.json(result);
}
