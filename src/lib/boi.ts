import { prisma } from "./prisma";

/**
 * Bank of Israel base rate ("ריבית בנק ישראל").
 * Prime = BOI + 1.5 in Israel.
 * We attempt to fetch the latest value from BOI's public SDMX endpoint and cache it
 * in the Setting table. If the fetch fails, we fall back to the cached value or the
 * BOI_BASE_RATE_FALLBACK env.
 */
export async function getBoiBaseRate(forceRefresh = false): Promise<{ rate: number; prime: number; updatedAt: string; source: "live" | "cache" | "fallback" }> {
  if (!forceRefresh) {
    const cached = await readCached();
    if (cached) return { ...cached, source: "cache" };
  }

  try {
    const live = await fetchLiveRate();
    if (live != null) {
      await writeCache(live);
      return { rate: live, prime: live + 1.5, updatedAt: new Date().toISOString(), source: "live" };
    }
  } catch {
    // swallow
  }

  const cached = await readCached();
  if (cached) return { ...cached, source: "cache" };

  const fallback = parseFloat(process.env.BOI_BASE_RATE_FALLBACK ?? "4.5");
  return { rate: fallback, prime: fallback + 1.5, updatedAt: new Date().toISOString(), source: "fallback" };
}

async function fetchLiveRate(): Promise<number | null> {
  // BOI publishes rate decisions at boi.org.il. The SDMX endpoint below returns
  // the interest-rate series (daily). We try it with a short timeout and parse JSON.
  const urls = [
    "https://edge.boi.gov.il/FusionEdgeServer/sdmx/v2/data/dataflow/BOI.STATISTICS,INTR_RATE_BOI,1.0/all?format=jsondata&lastNObservations=1",
  ];
  for (const url of urls) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
      clearTimeout(timer);
      if (!res.ok) continue;
      const data = await res.json();
      const value = extractLatestValue(data);
      if (value != null) return value;
    } catch {
      // try next
    }
  }
  return null;
}

function extractLatestValue(data: unknown): number | null {
  // SDMX-JSON has a complex structure; walk it defensively.
  try {
    const d = data as { data?: { dataSets?: Array<{ series?: Record<string, { observations?: Record<string, number[]> }> }> } };
    const series = d.data?.dataSets?.[0]?.series;
    if (!series) return null;
    for (const key of Object.keys(series)) {
      const obs = series[key].observations;
      if (!obs) continue;
      const keys = Object.keys(obs);
      if (!keys.length) continue;
      const last = obs[keys[keys.length - 1]];
      if (Array.isArray(last) && typeof last[0] === "number") return last[0];
    }
  } catch {
    return null;
  }
  return null;
}

async function readCached(): Promise<{ rate: number; prime: number; updatedAt: string } | null> {
  const rateRow = await prisma.setting.findUnique({ where: { key: "boi_base_rate" } });
  const updatedRow = await prisma.setting.findUnique({ where: { key: "boi_base_rate_updated" } });
  if (!rateRow) return null;
  const rate = parseFloat(rateRow.value);
  if (!Number.isFinite(rate)) return null;
  return { rate, prime: rate + 1.5, updatedAt: updatedRow?.value ?? new Date().toISOString() };
}

async function writeCache(rate: number) {
  await prisma.setting.upsert({
    where: { key: "boi_base_rate" },
    update: { value: String(rate) },
    create: { key: "boi_base_rate", value: String(rate) },
  });
  await prisma.setting.upsert({
    where: { key: "boi_base_rate_updated" },
    update: { value: new Date().toISOString() },
    create: { key: "boi_base_rate_updated", value: new Date().toISOString() },
  });
}

export async function setBoiBaseRateManual(rate: number) {
  await writeCache(rate);
  return getBoiBaseRate();
}
