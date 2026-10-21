import { z } from "zod";
export const createKitSchema = z.object({
  title: z.string().max(200).optional(), company: z.string().min(1).max(200),
  company_url: z.string().url().or(z.literal("")).optional(), role: z.string().min(1).max(200),
  seniority: z.string().max(100).optional(), job_description: z.string().max(30000).default(""),
  days_available: z.number().int().min(1).max(60), skip_company_research: z.boolean().optional(),
  daily_time_budget: z.number().int().min(15).max(600).default(120),
});
export const practiceSessionSchema = z.object({
  id: z.string().optional(), kind: z.enum(["practice", "daily"]), label: z.string().max(200).default(""), schedule_day: z.number().int().positive().optional(), topic_id: z.string().optional(), round_name: z.string().max(200).optional(), currentIndex:z.number().int().nonnegative().optional(),
  items: z.array(z.object({ type: z.enum(["question", "flashcard"]), id: z.string().min(1) })).min(1).max(200).refine((items)=>new Set(items.map((item)=>`${item.type}:${item.id}`)).size===items.length,"Practice items must not be repeated."),
});
