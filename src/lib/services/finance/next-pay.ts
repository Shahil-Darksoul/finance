import { getWorkSettings, listWorkEntries } from "@/lib/repo/work";
import type { WorkEntry, WorkSettings } from "@/lib/types";

export type NextPaySummary = {
  settings: WorkSettings;
  entries: WorkEntry[];
  totalHours: number;
  grossCents: number;
  taxCents: number;
  netCents: number;
};

/**
 * Standalone hourly-pay estimate. It reads only the work log, so it never
 * touches transactions, net worth or the forecast.
 */
export async function getNextPaySummary(userId: string): Promise<NextPaySummary> {
  const [settings, entries] = await Promise.all([
    getWorkSettings(userId),
    listWorkEntries(userId),
  ]);
  const totalHours = entries.reduce((sum, entry) => sum + entry.hours, 0);
  const grossCents = Math.round(totalHours * settings.hourlyRateCents);
  const taxCents = Math.round((grossCents * settings.taxPercent) / 100);
  return {
    settings,
    entries,
    totalHours,
    grossCents,
    taxCents,
    netCents: grossCents - taxCents,
  };
}