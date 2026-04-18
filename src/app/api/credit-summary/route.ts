import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-guard";
import { monthlyPayment, spitzerSchedule } from "@/lib/spitzer";
import { toNumber } from "@/lib/utils";

export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  const [loans, checks, boiRow] = await Promise.all([
    prisma.loan.findMany({ include: { account: { select: { name: true } } } }),
    prisma.check.findMany({
      where: { kind: "RECEIVABLE_DISCOUNTED", status: "PENDING" },
      include: { account: { select: { name: true } } },
    }),
    prisma.setting.findUnique({ where: { key: "boi_base_rate" } }),
  ]);

  const boi = boiRow ? parseFloat(boiRow.value) : parseFloat(process.env.BOI_BASE_RATE_FALLBACK ?? "4.5");
  const prime = boi + 1.5;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const loanItems = loans.map((l) => {
    const rate = l.type === "FIXED" ? toNumber(l.fixedRate) : prime + toNumber(l.spread);
    const basis = toNumber(l.currentBalance) > 0 ? toNumber(l.currentBalance) : toNumber(l.principal);
    const schedule = spitzerSchedule({
      principal: basis,
      annualRatePct: rate,
      termMonths: l.termMonths,
      startDate: new Date(l.startDate),
    });
    let remaining = basis;
    for (const row of schedule) {
      if (row.paymentDate <= today) remaining = row.balance;
      else break;
    }
    const override = toNumber(l.monthlyPaymentOverride);
    const pay = override > 0 ? override : monthlyPayment(basis, rate, l.termMonths);
    return {
      id: l.id,
      kind: "LOAN" as const,
      name: l.name,
      accountName: l.account?.name ?? null,
      principal: toNumber(l.principal),
      remaining: Math.round(remaining * 100) / 100,
      rate,
      monthlyPayment: Math.round(pay * 100) / 100,
      purpose: l.purpose ?? null,
      startDate: l.startDate,
      termMonths: l.termMonths,
    };
  });

  const discountItems = checks.map((c) => ({
    id: c.id,
    kind: "DISCOUNT" as const,
    name: `נכיון שיק ${c.counterparty}`,
    accountName: c.account?.name ?? null,
    amount: toNumber(c.amount),
    dueDate: c.dueDate,
    discountedOn: c.discountedOn,
    counterparty: c.counterparty,
    purpose: c.purpose ?? null,
    reference: c.reference,
  }));

  const totalLoans = loanItems.reduce((s, l) => s + l.remaining, 0);
  const totalDiscounts = discountItems.reduce((s, d) => s + d.amount, 0);
  const totalCredit = totalLoans + totalDiscounts;

  // Group by purpose
  const purposeTotals: Record<string, number> = {};
  for (const l of loanItems) {
    const key = l.purpose || "ללא מטרה מוגדרת";
    purposeTotals[key] = (purposeTotals[key] ?? 0) + l.remaining;
  }
  for (const d of discountItems) {
    const key = d.purpose || "נכיונות שוטפים";
    purposeTotals[key] = (purposeTotals[key] ?? 0) + d.amount;
  }
  const byPurpose = Object.entries(purposeTotals)
    .map(([purpose, amount]) => ({ purpose, amount: Math.round(amount * 100) / 100 }))
    .sort((a, b) => b.amount - a.amount);

  return NextResponse.json({
    loans: loanItems,
    discounts: discountItems,
    totalLoans: Math.round(totalLoans * 100) / 100,
    totalDiscounts: Math.round(totalDiscounts * 100) / 100,
    totalCredit: Math.round(totalCredit * 100) / 100,
    byPurpose,
  });
}
