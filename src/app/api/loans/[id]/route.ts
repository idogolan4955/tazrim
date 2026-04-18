import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api-guard";
import { spitzerSchedule, monthlyPayment } from "@/lib/spitzer";
import { toNumber } from "@/lib/utils";

async function resolveLoanRate(loan: { type: "FIXED" | "PRIME_LINKED"; spread: unknown; fixedRate: unknown | null }): Promise<number> {
  if (loan.type === "FIXED") return toNumber(loan.fixedRate);
  const boiRow = await prisma.setting.findUnique({ where: { key: "boi_base_rate" } });
  const boi = boiRow ? parseFloat(boiRow.value) : parseFloat(process.env.BOI_BASE_RATE_FALLBACK ?? "4.5");
  return boi + 1.5 + toNumber(loan.spread);
}

function computeRemainingBalance(loan: {
  principal: unknown;
  currentBalance: unknown | null;
  startDate: Date;
  termMonths: number;
}, rate: number): number {
  const basis = toNumber(loan.currentBalance) > 0 ? toNumber(loan.currentBalance) : toNumber(loan.principal);
  const schedule = spitzerSchedule({
    principal: basis,
    annualRatePct: rate,
    termMonths: loan.termMonths,
    startDate: new Date(loan.startDate),
  });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let remaining = basis;
  for (const row of schedule) {
    if (row.paymentDate <= today) remaining = row.balance;
    else break;
  }
  return Math.round(remaining * 100) / 100;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { id } = await params;
  const loan = await prisma.loan.findUnique({ where: { id }, include: { account: true } });
  if (!loan) return NextResponse.json({ error: "not found" }, { status: 404 });
  const rate = await resolveLoanRate(loan);
  const basis = toNumber(loan.currentBalance) > 0 ? toNumber(loan.currentBalance) : toNumber(loan.principal);
  const schedule = spitzerSchedule({
    principal: basis,
    annualRatePct: rate,
    termMonths: loan.termMonths,
    startDate: new Date(loan.startDate),
  });
  const computedPayment = monthlyPayment(basis, rate, loan.termMonths);
  const override = toNumber(loan.monthlyPaymentOverride);
  const pay = override > 0 ? override : computedPayment;
  const remainingBalance = computeRemainingBalance(loan, rate);
  return NextResponse.json({
    loan,
    schedule,
    effectiveRate: rate,
    monthlyPayment: Math.round(pay * 100) / 100,
    computedPayment: Math.round(computedPayment * 100) / 100,
    remainingBalance,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { id } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  for (const k of ["name", "principal", "currentBalance", "monthlyPaymentOverride", "type", "spread", "fixedRate", "termMonths", "accountId", "purpose", "notes"]) {
    if (body[k] !== undefined) data[k] = body[k];
  }
  if (body.startDate !== undefined) data.startDate = new Date(body.startDate);

  const loan = await prisma.loan.update({ where: { id }, data });

  // Keep the linked recurring transaction in sync.
  const rate = await resolveLoanRate(loan);
  const basis = toNumber(loan.currentBalance) > 0 ? toNumber(loan.currentBalance) : toNumber(loan.principal);
  const pay = toNumber(loan.monthlyPaymentOverride) > 0 ? toNumber(loan.monthlyPaymentOverride) : monthlyPayment(basis, rate, loan.termMonths);
  const start = new Date(loan.startDate);
  start.setMonth(start.getMonth() + 1);
  const endDate = new Date(loan.startDate);
  endDate.setMonth(endDate.getMonth() + loan.termMonths);

  const existing = await prisma.recurringTransaction.findFirst({ where: { source: "LOAN", sourceRefId: loan.id } });
  if (existing) {
    await prisma.recurringTransaction.update({
      where: { id: existing.id },
      data: {
        accountId: loan.accountId,
        name: `החזר הלוואה: ${loan.name}`,
        amount: Math.round(pay * 100) / 100,
        frequency: "MONTHLY",
        dayOfMonth: start.getDate(),
        startDate: start,
        endDate,
      },
    });
  } else {
    await prisma.recurringTransaction.create({
      data: {
        accountId: loan.accountId,
        name: `החזר הלוואה: ${loan.name}`,
        amount: Math.round(pay * 100) / 100,
        kind: "EXPENSE",
        frequency: "MONTHLY",
        dayOfMonth: start.getDate(),
        startDate: start,
        endDate,
        category: "הלוואות",
        source: "LOAN",
        sourceRefId: loan.id,
        active: true,
      },
    });
  }

  return NextResponse.json(loan);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { id } = await params;
  await prisma.recurringTransaction.deleteMany({ where: { source: "LOAN", sourceRefId: id } });
  await prisma.loan.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
