import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api-guard";
import { spitzerSchedule, monthlyPayment } from "@/lib/spitzer";
import { toNumber } from "@/lib/utils";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { id } = await params;
  const loan = await prisma.loan.findUnique({ where: { id }, include: { account: true } });
  if (!loan) return NextResponse.json({ error: "not found" }, { status: 404 });
  const boiRow = await prisma.setting.findUnique({ where: { key: "boi_base_rate" } });
  const boi = boiRow ? parseFloat(boiRow.value) : parseFloat(process.env.BOI_BASE_RATE_FALLBACK ?? "4.5");
  const rate = loan.type === "FIXED" ? toNumber(loan.fixedRate) : boi + 1.5 + toNumber(loan.spread);
  const schedule = spitzerSchedule({
    principal: toNumber(loan.principal),
    annualRatePct: rate,
    termMonths: loan.termMonths,
    startDate: new Date(loan.startDate),
  });
  const pay = monthlyPayment(toNumber(loan.principal), rate, loan.termMonths);
  return NextResponse.json({ loan, schedule, effectiveRate: rate, monthlyPayment: Math.round(pay * 100) / 100 });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { id } = await params;
  await prisma.recurringTransaction.deleteMany({ where: { source: "LOAN", sourceRefId: id } });
  await prisma.loan.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
