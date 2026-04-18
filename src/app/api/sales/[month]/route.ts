import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api-guard";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ month: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { month } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.salesAmount !== undefined) data.salesAmount = body.salesAmount;
  if (body.forecastAmount !== undefined) data.forecastAmount = body.forecastAmount;
  if (body.purchaseRatio !== undefined) data.purchaseRatio = body.purchaseRatio;
  if (body.notes !== undefined) data.notes = body.notes;
  const s = await prisma.monthlySales.update({ where: { month }, data });
  return NextResponse.json(s);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ month: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { month } = await params;
  await prisma.monthlySales.delete({ where: { month } });
  return NextResponse.json({ ok: true });
}
