import { NextRequest, NextResponse } from "next/server";
import { buildBalanceForecast } from "@/lib/balance-forecast";
import { requireAuth } from "@/lib/api-guard";

export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;
  const { searchParams } = new URL(req.url);
  const horizon = Number(searchParams.get("horizon") ?? 12);
  const data = await buildBalanceForecast(horizon);
  return NextResponse.json(data);
}
