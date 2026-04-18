import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireAuth } from "@/lib/api-guard";
import { spitzerSchedule, monthlyPayment } from "@/lib/spitzer";
import { toNumber } from "@/lib/utils";

async function getPrime() {
  const boiRow = await prisma.setting.findUnique({ where: { key: "boi_base_rate" } });
  const boi = boiRow ? parseFloat(boiRow.value) : parseFloat(process.env.BOI_BASE_RATE_FALLBACK ?? "4.5");
  return { boi, prime: boi + 1.5 };
}

function remainingBalanceOf(loan: {
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

export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;
  const loans = await prisma.loan.findMany({
    orderBy: { createdAt: "desc" },
    include: { account: { select: { id: true, name: true, color: true } } },
  });
  const { boi, prime } = await getPrime();
  const enriched = loans.map((l) => {
    const rate = l.type === "FIXED" ? toNumber(l.fixedRate) : prime + toNumber(l.spread);
    const basis = toNumber(l.currentBalance) > 0 ? toNumber(l.currentBalance) : toNumber(l.principal);
    const computedPayment = monthlyPayment(basis, rate, l.termMonths);
    const override = toNumber(l.monthlyPaymentOverride);
    const pay = override > 0 ? override : computedPayment;
    return {
      ...l,
      effectiveRate: rate,
      monthlyPayment: Math.round(pay * 100) / 100,
      computedPayment: Math.round(computedPayment * 100) / 100,
      remainingBalance: remainingBalanceOf(l, rate),
    };
  });
  return NextResponse.json({ loans: enriched, boi, prime });
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;
  const body = await req.json();
  const loan = await prisma.loan.create({
    data: {
      accountId: body.accountId,
      name: body.name,
      principal: body.principal,
      currentBalance: body.currentBalance ?? null,
      monthlyPaymentOverride: body.monthlyPaymentOverride ?? null,
      type: body.type ?? "PRIME_LINKED",
      spread: body.spread ?? 0,
      fixedRate: body.fixedRate ?? null,
      startDate: new Date(body.startDate),
      termMonths: body.termMonths,
      purpose: body.purpose ?? null,
      notes: body.notes ?? null,
    },
  });

  const { prime } = await getPrime();
  const rate = loan.type === "FIXED" ? toNumber(loan.fixedRate) : prime + toNumber(loan.spread);
  const basis = toNumber(loan.currentBalance) > 0 ? toNumber(loan.currentBalance) : toNumber(loan.principal);
  const computedPayment = monthlyPayment(basis, rate, loan.termMonths);
  const pay = toNumber(loan.monthlyPaymentOverride) > 0 ? toNumber(loan.monthlyPaymentOverride) : computedPayment;
  const start = new Date(loan.startDate);
  start.setMonth(start.getMonth() + 1);
  const endDate = new Date(loan.startDate);
  endDate.setMonth(endDate.getMonth() + loan.termMonths);

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

  return NextResponse.json(loan);
}
