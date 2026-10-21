import type { KitData } from "./schema";

/** Empty state used while the authoritative kit document is loading. */
export const emptyKitData: KitData = {
  source: { company: "", company_url: "", role: "", location: "", jd_chars: 0, researched_at: "", pages_used: [] },
  company_brief: { summary: "", what_they_do: "", sources: [], origin: "generated", updatedAt: "" },
  interview_research: { status: "pending", summary: "", topics: [], expected_round_count: null, rounds: [] },
  round_progress: { expected_round_count: null, completed_rounds: [], current_round: "" },
  role: { title: "", seniority: "", responsibilities: [], requirements: [] },
  questions: [], practice_topics: [], flashcards: [],
  schedule: { days_available: 1, days: [], warnings: [] },
  coverage: { uncovered_requirement_ids: [], passes: 0 },
  archived_items: { questions: [], flashcards: [] },
};
