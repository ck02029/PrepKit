import { z } from "zod";
import { kitDataSchema as sharedKitDataSchema, validateKitData } from "../../../packages/kit-schema/index.ts";

export const originSchema = z.enum(["generated", "edited", "pinned", "user"]);
export const provenanceSchema = z.enum(["researched", "inferred", "model_suggested", "user_authored"]);

export const sourceSchema = z.object({
  company: z.string(),
  company_url: z.string(),
  role: z.string(),
  location: z.string(),
  jd_chars: z.number().int().nonnegative(),
  researched_at: z.string(),
  pages_used: z.array(z.string()),
  web_research_skipped: z.boolean().optional(),
});

export const companyBriefSchema = z.object({
  summary: z.string(),
  what_they_do: z.string(),
  sources: z.array(z.string()),
  origin: originSchema,
  updatedAt: z.string(),
});

export const researchSourceSchema = z.object({
  url: z.string().url(),
  title: z.string(),
  publisher: z.string(),
});

export const topicInsightSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  subtopics: z.array(z.string()).optional(),
  round_name: z.string().optional(),
  frequency: z.enum(["most", "moderate", "least", "unknown"]),
  confidence: z.enum(["high", "medium", "low"]).nullable(),
  requirement_ids: z.array(z.string()),
  sources: z.array(researchSourceSchema),
  provenance: provenanceSchema.optional(),
  evidence_ids: z.array(z.string()).optional(),
  priority: z.number().int().positive().optional(),
});

export const interviewRoundSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  expectations: z.array(z.string()).optional(),
  order: z.number().int().positive(),
  confidence: z.enum(["high", "medium", "low"]).nullable(),
  sources: z.array(researchSourceSchema),
  basis: z.enum(["job_description", "company_reports", "role_reports", "role_inference"]).optional(),
  provenance: provenanceSchema.optional(),
  evidence_ids: z.array(z.string()).optional(),
});

export const interviewResearchSchema = z.object({
  status: z.enum(["pending", "researched", "unavailable"]),
  research_scope: z.enum(["company_specific", "role_level", "role_baseline"]).optional(),
  summary: z.string(),
  job_description_interview_info: z.object({
    expected_round_count: z.number().int().positive().nullable(),
    details: z.array(z.string()),
    stages: z.array(z.string()),
  }).optional(),
  topics: z.array(topicInsightSchema),
  expected_round_count: z.number().int().positive().nullable(),
  rounds: z.array(interviewRoundSchema),
}).default({
  status: "pending",
  summary: "",
  topics: [],
  expected_round_count: null,
  rounds: [],
});

export const roundProgressSchema = z.object({
  expected_round_count: z.number().int().positive().nullable(),
  completed_rounds: z.array(z.string()),
  current_round: z.string(),
}).default({
  expected_round_count: null,
  completed_rounds: [],
  current_round: "",
});

export const roleRequirementSchema = z.object({
  id: z.string(),
  text: z.string(),
  kind: z.enum(["technical", "behavioural", "domain"]),
  priority: z.enum(["must", "nice"]),
  evidence_quote: z.string().optional(),
  provenance: provenanceSchema.optional(),
  basis: z.enum(["job_description", "role_inference"]).optional(),
  evidence_ids: z.array(z.string()).optional(),
});

export const roleSchema = z.object({
  title: z.string(),
  seniority: z.string(),
  responsibilities: z.array(z.string()),
  requirements: z.array(roleRequirementSchema),
});

export const kitQuestionSchema = z.object({
  id: z.string(),
  requirement_ids: z.array(z.string()),
  topic_ids: z.array(z.string()).optional(),
  category: z.enum(["technical", "behavioural", "system-design", "company-fit"]),
  practice_type: z.enum(["interview", "coding", "writing"]).optional(),
  source_platform: z.string().nullable().optional(),
  source_url: z.string().nullable().optional(),
  coding_links: z.array(z.object({ kind: z.enum(["problem", "guide"]), label: z.string(), url: z.string().url(), verified: z.boolean() })).optional(),
  source_type: z.enum(["generated", "reported"]).optional(),
  round_name: z.string().nullable().optional(),
  reported_at: z.string().nullable().optional(),
  report_count: z.number().int().nonnegative().nullable().optional(),
  reliability: z.enum(["high", "medium", "low", "unverified"]).nullable().optional(),
  prompt: z.string(),
  answer_outline: z.string(),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  origin: originSchema,
  updatedAt: z.string(),
  provenance: provenanceSchema.optional(),
  evidence_ids: z.array(z.string()).optional(),
});

export const flashcardSchema = z.object({
  id: z.string(),
  front: z.string(),
  back: z.string(),
  requirement_ids: z.array(z.string()),
  topic_ids: z.array(z.string()).optional(),
  origin: originSchema,
  updatedAt: z.string(),
  provenance: provenanceSchema.optional(),
  evidence_ids: z.array(z.string()).optional(),
});

export const learningResourceSchema = z.object({ label: z.string(), url: z.string().url(), status: z.enum(["verified", "suggested", "failed"]).optional(), verifiedAt: z.string().optional() });
export const practiceTopicSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  subtopics: z.array(z.string()),
  round_name: z.string().optional(),
  requirement_ids: z.array(z.string()),
  learning_resources: z.array(learningResourceSchema),
  basis: z.enum(["job_description", "verified_reports", "company_reports", "role_reports", "role_inference", "sample"]).optional(),
  rationale: z.string().optional(),
  evidence: z.array(z.string()).optional(),
  confidence: z.enum(["high", "medium", "low"]).nullable().optional(),
  provenance: provenanceSchema.optional(),
  evidence_ids: z.array(z.string()).optional(),
  priority: z.number().int().positive().optional(),
});

export const kitGenerationInputSchema = z.object({
  title: z.string().optional(),
  company: z.string(),
  company_url: z.string().url().or(z.literal("")).optional(),
  skip_company_research: z.boolean().optional(),
  role: z.string(),
  seniority: z.string().optional(),
  job_description: z.string().default(""),
  days_available: z.number().int().positive(),
  round_progress: roundProgressSchema.optional(),
});

export const kitGenerationOutputSchema = z.object({
  role: roleSchema,
  practice_topics: z.array(practiceTopicSchema),
  interview_research: interviewResearchSchema,
  questions: z.array(kitQuestionSchema),
});

export const scheduleDaySchema = z.object({
  day: z.number().int().positive(),
  focus: z.string(),
  question_ids: z.array(z.string()),
  flashcard_ids: z.array(z.string()).optional(),
  topic_ids: z.array(z.string()).optional(),
  requirement_ids: z.array(z.string()).optional(),
  minutes: z.number().int().nonnegative(),
});

export const scheduleSchema = z.object({
  days_available: z.number().int().nonnegative(),
  days: z.array(scheduleDaySchema),
  warnings: z.array(z.string()).optional(),
});

export const coverageSchema = z.object({
  uncovered_requirement_ids: z.array(z.string()),
  passes: z.number().int().nonnegative(),
});

export const kitDataSchema = sharedKitDataSchema;

export type Origin = z.infer<typeof originSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type CompanyBrief = z.infer<typeof companyBriefSchema>;
export type ResearchSource = z.infer<typeof researchSourceSchema>;
export type TopicInsight = z.infer<typeof topicInsightSchema>;
export type InterviewRound = z.infer<typeof interviewRoundSchema>;
export type InterviewResearch = z.infer<typeof interviewResearchSchema>;
export type RoundProgress = z.infer<typeof roundProgressSchema>;
export type RoleRequirement = z.infer<typeof roleRequirementSchema>;
export type Role = z.infer<typeof roleSchema>;
export type KitQuestion = z.infer<typeof kitQuestionSchema>;
export type Flashcard = z.infer<typeof flashcardSchema>;
export type PracticeTopic = z.infer<typeof practiceTopicSchema>;
export type KitGenerationInput = z.infer<typeof kitGenerationInputSchema>;
export type KitGenerationOutput = z.infer<typeof kitGenerationOutputSchema>;
export type ScheduleDay = z.infer<typeof scheduleDaySchema>;
export type Schedule = z.infer<typeof scheduleSchema>;
export type Coverage = z.infer<typeof coverageSchema>;
export type KitData = z.infer<typeof kitDataSchema>;

export function parseKitData(value: unknown): KitData {
  return validateKitData(value);
}

export const generationStatusSchema = z.object({
  status: z.enum(["generating", "waiting_for_quota", "ready", "needs_review", "failed", "cancelled"]),
  message: z.string().optional(),
  retryAt: z.string().optional(),
  steps: z.array(z.object({
    name: z.string(),
    state: z.enum(["pending", "running", "done", "warning", "failed"]),
    detail: z.string(),
  })),
  sources: z.array(z.object({
    url: z.string(),
    state: z.enum(["read", "skipped"]),
    reason: z.string(),
  })),
  coverage: coverageSchema,
});

export type GenerationStatus = z.infer<typeof generationStatusSchema>;
