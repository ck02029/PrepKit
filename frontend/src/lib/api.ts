import type { Kit } from "@/lib/types";
import {
  backendCancelGeneration,
  backendCreateKit,
  backendDeleteKit,
  backendFetchGeneration,
  backendFetchKit,
  backendFetchKitData,
  backendFetchScheduleProgress,
  backendListKits,
  backendPatchKitData,
  backendRegenerateSection,
  backendRetryGeneration,
  backendSetScheduleProgress,
  backendUpdateKit,
} from "@/lib/backend-api";
import type { GenerationStatus, KitData, RoundProgress } from "@/lib/schema";

export { apiFetch, registerApiQueryClient } from "@/lib/api-client";

export const fetchKits = backendListKits;
export const deleteKit = backendDeleteKit;

export async function retryKit(id: string): Promise<Kit> {
  await backendRetryGeneration(id);
  const kit = await backendFetchKit(id);
  if (!kit) throw new Error("The kit was not found after retrying generation.");
  return kit;
}

export function regenerateKitSection(id: string, section: "overview" | "topics" | "rounds" | "questions" | "flashcards" | "schedule", category?: "technical" | "behavioural" | "system-design" | "company-fit"): Promise<void> {
  return backendRegenerateSection(id, section, category);
}

export const fetchKit = backendFetchKit;
export const loadKitData = backendFetchKitData;

export function createKit(
  input: Pick<Kit, "title" | "company" | "role"> & Partial<Pick<Kit, "daysAvailable" | "bufferDays">> & { roundProgress?: Partial<RoundProgress>; jobDescription?: string; companyUrl?: string; skipResearch?: boolean },
): Promise<Kit> {
  return backendCreateKit({
    title: input.title,
    company: input.company,
    company_url: input.companyUrl ?? "",
    skip_company_research: input.skipResearch,
    role: input.role,
    job_description: input.jobDescription ?? "",
    days_available: input.daysAvailable ?? 5,
    round_progress: input.roundProgress ? {
      expected_round_count: input.roundProgress.expected_round_count ?? null,
      completed_rounds: input.roundProgress.completed_rounds ?? [],
      current_round: input.roundProgress.current_round ?? "",
    } : undefined,
  }).then(({ kit }) => kit);
}

export function saveKit(id: string, patch: Partial<Pick<Kit, "title" | "company" | "role" | "interviewDate" | "notes">>): Promise<Kit> {
  return backendUpdateKit(id, patch);
}

export function patchKitData(kitId: string, data: KitData, version: number): Promise<{ data: KitData; version: number }> {
  return backendPatchKitData(kitId, data, version);
}

export const cancelGeneration = backendCancelGeneration;
export const fetchScheduleProgress = backendFetchScheduleProgress;
export const setScheduleDayCompleted = backendSetScheduleProgress;

export function fetchGenerationStatus(kitId: string): Promise<GenerationStatus> {
  return backendFetchGeneration(kitId);
}
