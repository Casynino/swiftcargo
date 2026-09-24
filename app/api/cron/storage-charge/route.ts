import { NextResponse } from "next/server";

import { accrueStorage } from "@/lib/storage-charge";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Called by the Vercel scheduler just after midnight in Dar es Salaam
 * (vercel.json), when a new storage day begins, so every bill carries today's
 * storage before the first customer walks in. Same bearer check as the notice
 * job. Safe to repeat: a bill already at today's figure is left alone.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  const result = await accrueStorage();
  return NextResponse.json({ checked: result.checked, charged: result.charged.length });
}
