import { resolvePeriodRange, type DateRange } from "@/lib/services/accounting.service";

export function resolveReportRange(query: { period: string; from?: Date; to?: Date }): DateRange {
  if (query.period === "custom") {
    // reportQuerySchema's refine() already guarantees from/to are present for "custom".
    return { from: query.from!, to: query.to! };
  }
  return resolvePeriodRange(query.period as "daily" | "weekly" | "monthly");
}
