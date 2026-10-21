import { z } from "zod";

export const kitSchema = z.object({
  id: z.string(),
  title: z.string(),
  company: z.string(),
  role: z.string(),
  interviewDate: z.string().nullable(),
  notes: z.string(),
  updatedAt: z.string(),
  status: z.enum(["ready", "needs_review", "generating", "failed"]).optional(),
  daysAvailable: z.number().int().min(1).max(60).optional(),
  bufferDays: z.number().int().min(0).max(60).optional(),
});

export type Kit = z.infer<typeof kitSchema>;

