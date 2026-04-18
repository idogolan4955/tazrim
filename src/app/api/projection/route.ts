import { NextRequest, NextResponse } from "next/server";
import { buildProjection } from "@/lib/projection";
import { requireAuth } from "@/lib/api-guard";

export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;
  const { searchParams } = new URL(req.url);
  const ids = searchParams.get("accountIds");
  const horizon = Number(searchParams.get("horizon") ?? 12);
  const data = await buildProjection({
    accountIds: ids ? ids.split(",").filter(Boolean) : undefined,
    horizonMonths: horizon,
  });
  return NextResponse.json(data);
}
