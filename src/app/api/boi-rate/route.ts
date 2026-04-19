import { NextRequest, NextResponse } from "next/server";
import { getBoiBaseRate, setBoiBaseRateManual } from "@/lib/boi";
import { requireAdmin, requireAuth } from "@/lib/api-guard";
import { logAction } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;
  const { searchParams } = new URL(req.url);
  const refresh = searchParams.get("refresh") === "1";
  const data = await getBoiBaseRate(refresh);
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;
  const body = await req.json();
  if (typeof body.rate !== "number") return NextResponse.json({ error: "rate required" }, { status: 400 });
  const data = await setBoiBaseRateManual(body.rate);
  await logAction({
    action: "UPDATE",
    entity: "SETTING",
    summary: `עודכנה ריבית בנק ישראל ל-${body.rate.toFixed(2)}% (פריים ${(body.rate + 1.5).toFixed(2)}%)`,
  });
  return NextResponse.json(data);
}
