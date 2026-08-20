import { z } from "zod";

export const reportPeriods = ["daily", "weekly", "monthly", "custom"] as const;

export const reportQuerySchema = z
  .object({
    period: z.enum(reportPeriods).default("monthly"),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .refine((value) => value.period !== "custom" || (value.from && value.to), {
    message: "A custom period requires both from and to dates.",
    path: ["from"],
  });

export const topProductsQuerySchema = z
  .object({
    period: z.enum(reportPeriods).default("monthly"),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    limit: z.coerce.number().int().positive().max(50).default(10),
  })
  .refine((value) => value.period !== "custom" || (value.from && value.to), {
    message: "A custom period requires both from and to dates.",
    path: ["from"],
  });

export type ReportQuery = z.infer<typeof reportQuerySchema>;
export type TopProductsQuery = z.infer<typeof topProductsQuerySchema>;
