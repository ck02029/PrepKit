import { z } from "zod";
const provenance=z.enum(["researched","inferred","model_suggested","user_authored"]);
const origin=z.enum(["generated","edited","pinned","user"]);
const resource=z.object({label:z.string(),url:z.string().url(),status:z.enum(["verified","suggested","failed"]).optional(),verifiedAt:z.string().optional()});
const requirement=z.object({id:z.string().min(1),text:z.string(),kind:z.enum(["technical","behavioural","domain"]),priority:z.enum(["must","nice"]),evidence_quote:z.string().optional(),provenance:provenance.optional(),basis:z.enum(["job_description","role_inference"]).optional(),evidence_ids:z.array(z.string()).optional()});
const topic=z.object({id:z.string(),label:z.string(),description:z.string(),subtopics:z.array(z.string()).optional(),round_name:z.string().optional(),requirement_ids:z.array(z.string()),learning_resources:z.array(resource),basis:z.enum(["job_description","verified_reports","company_reports","role_reports","role_inference","sample"]).optional(),rationale:z.string().optional(),evidence:z.array(z.string()).optional(),confidence:z.enum(["high","medium","low"]).nullable().optional(),provenance:provenance.optional(),evidence_ids:z.array(z.string()).optional()});
const question=z.object({id:z.string(),requirement_ids:z.array(z.string()),topic_ids:z.array(z.string()).optional(),category:z.enum(["technical","behavioural","system-design","company-fit"]),practice_type:z.enum(["interview","coding","writing"]).optional(),source_platform:z.string().nullable().optional(),source_url:z.string().nullable().optional(),coding_links:z.array(z.object({kind:z.enum(["problem","guide"]),label:z.string(),url:z.string().url(),verified:z.boolean()})).optional(),source_type:z.enum(["generated","reported"]).optional(),round_name:z.string().nullable().optional(),reported_at:z.string().nullable().optional(),report_count:z.number().int().nonnegative().nullable().optional(),reliability:z.enum(["high","medium","low","unverified"]).nullable().optional(),prompt:z.string(),answer_outline:z.string(),difficulty:z.union([z.literal(1),z.literal(2),z.literal(3)]),origin,updatedAt:z.string(),provenance:provenance.optional(),evidence_ids:z.array(z.string()).optional()});
const flashcard=z.object({id:z.string(),front:z.string(),back:z.string(),requirement_ids:z.array(z.string()),topic_ids:z.array(z.string()).optional(),origin,updatedAt:z.string(),provenance:provenance.optional(),evidence_ids:z.array(z.string()).optional()});
export const kitDataSchema=z.object({
  source:z.object({company:z.string(),company_url:z.string(),role:z.string(),location:z.string(),jd_chars:z.number().int().nonnegative(),researched_at:z.string(),pages_used:z.array(z.string()),web_research_skipped:z.boolean().optional()}),
  company_brief:z.object({summary:z.string(),what_they_do:z.string(),sources:z.array(z.string()),origin,updatedAt:z.string()}),
  interview_research:z.object({status:z.enum(["pending","researched","unavailable"]),research_scope:z.enum(["company_specific","role_level","role_baseline"]).optional(),summary:z.string(),job_description_interview_info:z.object({expected_round_count:z.number().int().positive().nullable(),details:z.array(z.string()),stages:z.array(z.string())}).optional(),topics:z.array(z.object({id:z.string(),label:z.string(),description:z.string(),subtopics:z.array(z.string()).optional(),round_name:z.string().optional(),frequency:z.enum(["most","moderate","least","unknown"]),confidence:z.enum(["high","medium","low"]).nullable(),requirement_ids:z.array(z.string()),sources:z.array(z.object({url:z.string().url(),title:z.string(),publisher:z.string()}))})),expected_round_count:z.number().int().positive().nullable(),rounds:z.array(z.object({id:z.string(),name:z.string(),description:z.string(),expectations:z.array(z.string()).optional(),order:z.number().int().positive(),confidence:z.enum(["high","medium","low"]).nullable(),sources:z.array(z.object({url:z.string().url(),title:z.string(),publisher:z.string()})),basis:z.enum(["job_description","company_reports","role_reports","role_inference"]).optional(),provenance:provenance.optional(),evidence_ids:z.array(z.string()).optional()}))}).default({status:"pending",summary:"",topics:[],expected_round_count:null,rounds:[]}),
  round_progress:z.object({expected_round_count:z.number().int().positive().nullable(),completed_rounds:z.array(z.string()),current_round:z.string()}).default({expected_round_count:null,completed_rounds:[],current_round:""}),
  role:z.object({title:z.string(),seniority:z.string(),responsibilities:z.array(z.string()),requirements:z.array(requirement)}),
  questions:z.array(question),practice_topics:z.array(topic).default([]),flashcards:z.array(flashcard),
  schedule:z.object({days_available:z.number().int().positive(),days:z.array(z.object({day:z.number().int().positive(),focus:z.string(),question_ids:z.array(z.string()),flashcard_ids:z.array(z.string()).optional(),topic_ids:z.array(z.string()).optional(),requirement_ids:z.array(z.string()).optional(),minutes:z.number().int().nonnegative()})),warnings:z.array(z.string()).optional()}),
  coverage:z.object({uncovered_requirement_ids:z.array(z.string()),passes:z.number().int().nonnegative()}),
  archived_items:z.object({questions:z.array(question).default([]),flashcards:z.array(flashcard).default([])}).optional(),
});

export type KitData = z.infer<typeof kitDataSchema>;

export function validateKitData(value: unknown) {
  const data = kitDataSchema.parse(value);
  const requirements = new Set(data.role.requirements.map((item) => item.id));
  const topics = new Set(data.practice_topics.map((item) => item.id));
  const questions = new Set(data.questions.map((item) => item.id));
  const cards = new Set(data.flashcards.map((item) => item.id));
  const roundIds = new Set(data.interview_research.rounds.map((item) => item.id));
  const researchTopicIds = new Set(data.interview_research.topics.map((item) => item.id));
  if (requirements.size !== data.role.requirements.length || topics.size !== data.practice_topics.length || questions.size !== data.questions.length || cards.size !== data.flashcards.length || roundIds.size !== data.interview_research.rounds.length || researchTopicIds.size !== data.interview_research.topics.length || data.schedule.days.length !== data.schedule.days_available) throw new Error("Kit has duplicate IDs or an incorrect schedule day count.");
  if (data.schedule.days.some((day, index) => day.day !== index + 1)) throw new Error("Schedule days must be unique and ordered from 1 through the available day count.");
  for (const topic of data.practice_topics) if (topic.requirement_ids.some((id) => !requirements.has(id))) throw new Error(`Topic ${topic.id} references an unknown requirement.`);
  for (const question of data.questions) {
    if (question.requirement_ids.some((id) => !requirements.has(id))) throw new Error(`Question ${question.id} references an unknown requirement.`);
    if ((question.topic_ids ?? []).some((id) => !topics.has(id))) throw new Error(`Question ${question.id} references an unknown topic.`);
  }
  for (const card of data.flashcards) {
    if (card.requirement_ids.some((id) => !requirements.has(id))) throw new Error(`Flashcard ${card.id} references an unknown requirement.`);
    if ((card.topic_ids ?? []).some((id) => !topics.has(id))) throw new Error(`Flashcard ${card.id} references an unknown topic.`);
  }
  const scheduledQuestions = new Set<string>();
  for (const day of data.schedule.days) {
    if (day.question_ids.some((id) => !questions.has(id)) || (day.flashcard_ids ?? []).some((id) => !cards.has(id)) || (day.topic_ids ?? []).some((id) => !topics.has(id)) || (day.requirement_ids ?? []).some((id) => !requirements.has(id))) throw new Error(`Schedule day ${day.day} has a dangling item reference.`);
    if (new Set(day.question_ids).size !== day.question_ids.length || new Set(day.flashcard_ids ?? []).size !== (day.flashcard_ids ?? []).length || day.question_ids.some((id) => scheduledQuestions.has(id))) throw new Error(`A practice item is scheduled more than once (day ${day.day}).`);
    day.question_ids.forEach((id) => scheduledQuestions.add(id));
  }
  if (data.coverage.uncovered_requirement_ids.some((id) => !requirements.has(id))) throw new Error("Coverage references an unknown requirement.");
  for (const topic of data.interview_research.topics) if (topic.requirement_ids.some((id) => !requirements.has(id))) throw new Error(`Research topic ${topic.id} references an unknown requirement.`);
  if (data.round_progress.completed_rounds.some((name) => !data.interview_research.rounds.some((round) => round.name === name)) || (data.round_progress.current_round && !data.interview_research.rounds.some((round) => round.name === data.round_progress.current_round))) throw new Error("Round progress references a round that is not in the kit.");
  return data;
}

