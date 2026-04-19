import { prisma } from "./prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "./auth";

export type AuditAction = "CREATE" | "UPDATE" | "DELETE" | "CONVERT" | "STATUS_CHANGE" | "IMPORT";
export type AuditEntity =
  | "ACCOUNT"
  | "TRANSACTION"
  | "CHECK"
  | "LOAN"
  | "RECURRING"
  | "SALE"
  | "RECEIVABLE"
  | "SETTING";
export type AmountKind = "INCOME" | "EXPENSE" | "NEUTRAL";

export interface AuditInput {
  action: AuditAction;
  entity: AuditEntity;
  entityId?: string | null;
  summary: string;
  amount?: number | null;
  amountKind?: AmountKind | null;
}

/**
 * Silently records an audit log entry for the current user.
 * Never throws — logging failures must not break the underlying mutation.
 */
export async function logAction(input: AuditInput): Promise<void> {
  try {
    const session = await getServerSession(authOptions);
    await prisma.auditLog.create({
      data: {
        userId: session?.user?.id ?? null,
        userName: session?.user?.name ?? session?.user?.email ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        summary: input.summary,
        amount: input.amount != null ? input.amount : null,
        amountKind: input.amountKind ?? null,
      },
    });
  } catch (err) {
    console.error("[audit] failed to log:", err);
  }
}

/**
 * Fire-and-forget variant: safe to call without `await` at end of mutating handlers.
 * Returns immediately; logging runs in the background.
 */
export function logFireAndForget(input: AuditInput): void {
  void logAction(input);
}
