import { prisma } from "./prisma";

const DEFAULTS: Record<string, string> = {
  opening_inventory: "0",
  opening_inventory_date: new Date().toISOString(),
  cogs_ratio: "0.35",
  default_purchase_account_id: "",
  default_purchase_ratio: "0.35",
};

export async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key } });
  if (row) return row.value;
  return DEFAULTS[key] ?? null;
}

export async function setSetting(key: string, value: string) {
  return prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

export async function getSettings(keys: string[]): Promise<Record<string, string>> {
  const rows = await prisma.setting.findMany({ where: { key: { in: keys } } });
  const out: Record<string, string> = {};
  for (const k of keys) {
    const row = rows.find((r) => r.key === k);
    out[k] = row ? row.value : (DEFAULTS[k] ?? "");
  }
  return out;
}
