import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api-guard";
import type { CheckKind, CheckStatus } from "@prisma/client";

interface BulkCheckInput {
  accountId: string;
  kind: CheckKind;
  amount: number;
  dueDate: string;
  discountedOn?: string | null;
  counterparty?: string | null;
  reference?: string | null;
  status?: CheckStatus;
  purpose?: string | null;
  notes?: string | null;
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;
  const body = await req.json();
  if (!Array.isArray(body.checks)) {
    return NextResponse.json({ error: "checks array required" }, { status: 400 });
  }
  const items = body.checks as BulkCheckInput[];
  const errors: { index: number; reason: string }[] = [];
  const data: Parameters<typeof prisma.check.create>[0]["data"][] = [];

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it.accountId) { errors.push({ index: i, reason: "חסר חשבון" }); continue; }
    if (!it.kind) { errors.push({ index: i, reason: "חסר סוג" }); continue; }
    if (!it.amount || !Number.isFinite(it.amount) || it.amount <= 0) { errors.push({ index: i, reason: "סכום לא תקין" }); continue; }
    if (!it.dueDate) { errors.push({ index: i, reason: "חסר תאריך פרעון" }); continue; }
    const due = new Date(it.dueDate);
    if (Number.isNaN(due.getTime())) { errors.push({ index: i, reason: "תאריך פרעון לא תקין" }); continue; }
    data.push({
      accountId: it.accountId,
      kind: it.kind,
      amount: it.amount,
      dueDate: due,
      discountedOn: it.discountedOn ? new Date(it.discountedOn) : null,
      counterparty: (it.counterparty ?? "").trim() || "—",
      reference: it.reference ?? null,
      status: it.status ?? "PENDING",
      purpose: it.purpose ?? null,
      notes: it.notes ?? null,
    });
  }

  if (errors.length > 0 && data.length === 0) {
    return NextResponse.json({ created: 0, errors }, { status: 400 });
  }

  const result = await prisma.$transaction(data.map((d) => prisma.check.create({ data: d })));
  return NextResponse.json({ created: result.length, errors });
}
