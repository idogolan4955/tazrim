import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireAuth } from "@/lib/api-guard";
import { logAction } from "@/lib/audit";

export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;
  const sales = await prisma.monthlySales.findMany({ orderBy: { month: "desc" }, take: 60 });
  return NextResponse.json(sales);
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;
  const body = await req.json();
  const s = await prisma.monthlySales.upsert({
    where: { month: body.month },
    update: {
      salesAmount: body.salesAmount ?? 0,
      forecastAmount: body.forecastAmount ?? null,
      actualPurchase: body.actualPurchase ?? null,
      purchaseRatio: body.purchaseRatio ?? 0.35,
      notes: body.notes ?? null,
    },
    create: {
      month: body.month,
      salesAmount: body.salesAmount ?? 0,
      forecastAmount: body.forecastAmount ?? null,
      actualPurchase: body.actualPurchase ?? null,
      purchaseRatio: body.purchaseRatio ?? 0.35,
      notes: body.notes ?? null,
    },
  });
  const actual = Number(s.salesAmount);
  const forecast = s.forecastAmount ? Number(s.forecastAmount) : null;
  const summaryParts: string[] = [];
  if (body.salesAmount !== undefined && actual > 0) summaryParts.push(`מכירות בפועל`);
  if (body.forecastAmount !== undefined) summaryParts.push(`תחזית`);
  if (body.actualPurchase !== undefined) summaryParts.push(`רכש בפועל`);
  if (body.purchaseRatio !== undefined) summaryParts.push(`מקדם רכש`);
  const primary = actual > 0 ? actual : (forecast ?? 0);
  await logAction({
    action: "UPDATE",
    entity: "SALE",
    entityId: s.id,
    summary: `עודכן חודש ${s.month}${summaryParts.length ? ` — ${summaryParts.join(", ")}` : ""}`,
    amount: primary > 0 ? primary : null,
    amountKind: "INCOME",
  });
  return NextResponse.json(s);
}
