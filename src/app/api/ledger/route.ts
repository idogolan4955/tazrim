import { NextRequest, NextResponse } from "next/server";
import { buildLedger } from "@/lib/projection";
import { requireAuth } from "@/lib/api-guard";

export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;
  const { searchParams } = new URL(req.url);
  const ids = searchParams.get("accountIds");
  const horizon = Number(searchParams.get("horizon") ?? 12);
  const includePast = searchParams.get("includePast") === "1";
  const pastDays = Number(searchParams.get("pastDays") ?? 60);
  const data = await buildLedger({
    accountIds: ids ? ids.split(",").filter(Boolean) : undefined,
    horizonMonths: horizon,
    includePast,
    pastDays,
  });
  return NextResponse.json(data);
}
