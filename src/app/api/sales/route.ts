import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireAuth } from "@/lib/api-guard";

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
  return NextResponse.json(s);
}
