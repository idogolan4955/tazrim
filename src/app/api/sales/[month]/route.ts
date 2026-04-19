import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api-guard";
import { logAction } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ month: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { month } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.salesAmount !== undefined) data.salesAmount = body.salesAmount;
  if (body.forecastAmount !== undefined) data.forecastAmount = body.forecastAmount;
  if (body.actualPurchase !== undefined) data.actualPurchase = body.actualPurchase;
  if (body.purchaseRatio !== undefined) data.purchaseRatio = body.purchaseRatio;
  if (body.notes !== undefined) data.notes = body.notes;
  const s = await prisma.monthlySales.update({ where: { month }, data });
  const parts: string[] = [];
  if (body.salesAmount !== undefined) parts.push("מכירות בפועל");
  if (body.forecastAmount !== undefined) parts.push("תחזית");
  if (body.actualPurchase !== undefined) parts.push("רכש בפועל");
  if (body.purchaseRatio !== undefined) parts.push("מקדם");
  if (body.notes !== undefined) parts.push("הערות");
  const primaryAmount = body.actualPurchase ?? body.salesAmount ?? body.forecastAmount ?? null;
  await logAction({
    action: "UPDATE",
    entity: "SALE",
    entityId: s.id,
    summary: `עודכן חודש ${s.month}${parts.length ? ` — ${parts.join(", ")}` : ""}`,
    amount: primaryAmount != null && Number(primaryAmount) > 0 ? Number(primaryAmount) : null,
    amountKind: body.actualPurchase !== undefined ? "EXPENSE" : "INCOME",
  });
  return NextResponse.json(s);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ month: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { month } = await params;
  await prisma.monthlySales.delete({ where: { month } });
  await logAction({
    action: "DELETE",
    entity: "SALE",
    summary: `נמחקו נתוני חודש ${month}`,
  });
  return NextResponse.json({ ok: true });
}
