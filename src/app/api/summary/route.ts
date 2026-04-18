import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-guard";
import { toNumber } from "@/lib/utils";
import { buildProjection } from "@/lib/projection";

export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  const [accounts, loans, checks, receivables] = await Promise.all([
    prisma.account.findMany(),
    prisma.loan.findMany(),
    prisma.check.findMany({ where: { status: "PENDING" } }),
    prisma.receivable.findMany(),
  ]);

  const { byAccount } = await buildProjection({ horizonMonths: 12 });
  const currentTotal = byAccount.reduce((s, a) => s + a.current, 0);
  const totalInventory = accounts.reduce((s, a) => s + toNumber(a.inventory), 0);
  const totalLoans = loans.reduce((s, l) => s + toNumber(l.principal), 0);
  const postDatedReceivable = checks
    .filter((c) => c.kind === "RECEIVABLE_DEFERRED")
    .reduce((s, c) => s + toNumber(c.amount), 0);
  const discountedReceivable = checks
    .filter((c) => c.kind === "RECEIVABLE_DISCOUNTED")
    .reduce((s, c) => s + toNumber(c.amount), 0);
  const payableChecks = checks
    .filter((c) => c.kind === "PAYABLE")
    .reduce((s, c) => s + toNumber(c.amount), 0);
  const receivablesTotal = receivables.reduce((s, r) => s + toNumber(r.amount), 0);

  // Assets - Liabilities (simple view):
  // Assets: cash (current) + post-dated receivable checks + inventory + customer receivables
  // Liabilities: loans + payable checks
  // (Discounted checks are already reflected in cash, not added again.)
  const assets = currentTotal + postDatedReceivable + totalInventory + receivablesTotal;
  const liabilities = totalLoans + payableChecks;
  const equity = assets - liabilities;

  return NextResponse.json({
    currentTotal,
    totalInventory,
    totalLoans,
    postDatedReceivable,
    discountedReceivable,
    payableChecks,
    receivablesTotal,
    assets,
    liabilities,
    equity,
  });
}
