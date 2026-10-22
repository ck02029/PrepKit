import { apiFetch } from "@/lib/api-client";
import { kitDataSchema, kitGenerationInputSchema, type KitData, type KitGenerationInput } from "@/lib/schema";
import { kitSchema, type Kit } from "@/lib/types";

export type BackendKit = Kit;

export function backendBaseUrl(): string | null {
  const value = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (value === undefined) return process.env.NODE_ENV === "development" ? "" : null;
  return value.trim().replace(/\/+$/, "");
}

export function isBackendConfigured(): boolean {
  return backendBaseUrl() !== null;
}

async function backendRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const baseUrl = backendBaseUrl();
  if (baseUrl === null) throw new Error("Backend mode requires NEXT_PUBLIC_API_BASE_URL.");
  const response = await apiFetch(`${baseUrl}${path}`, {
    ...init,
    headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { message?: unknown } } | null;
    const apiMessage = typeof body?.error?.message === "string" ? body.error.message : "";
    const message = apiMessage || (response.status === 429
      ? "You have reached a request limit. Wait a little, then try again."
      : response.status >= 500
        ? "PrepKit could not complete that request. Please try again shortly."
        : response.status === 404
          ? "The requested PrepKit item could not be found."
          : "We couldn't complete that request. Check the information and try again.");
    throw Object.assign(new Error(message), { status: response.status });
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function backendListKits(): Promise<BackendKit[]> {
  const result = await backendRequest<{ kits: unknown[] }>("/api/kits");
  return result.kits.map((kit) => kitSchema.parse(kit));
}

export async function backendFetchKit(id: string): Promise<BackendKit | null> {
  if (!id) return null;
  try {
    const result = await backendRequest<{ kit: unknown }>(`/api/kits/${encodeURIComponent(id)}`);
    return kitSchema.parse(result.kit);
  } catch (error) {
    if (typeof error === "object" && error !== null && "status" in error && error.status === 404) return null;
    throw error;
  }
}

export async function backendCreateKit(input: KitGenerationInput): Promise<{ kit: BackendKit; data: KitData; version: number }> {
  const validatedInput = kitGenerationInputSchema.parse(input);
  const result = await backendRequest<{ kit: unknown; data: unknown; version?: number }>("/api/kits", {
    method: "POST",
    body: JSON.stringify(validatedInput),
  });
  const kit = kitSchema.parse(result.kit);
  const version = result.version ?? 1;
  return { kit, data: kitDataSchema.parse(result.data), version };
}

export async function backendFetchGeneration(id: string): Promise<import("@/lib/schema").GenerationStatus> {
  return backendRequest(`/api/kits/${encodeURIComponent(id)}/generation`);
}

export async function backendCancelGeneration(id: string): Promise<void> {
  await backendRequest(`/api/kits/${encodeURIComponent(id)}/generation/cancel`, { method: "POST" });
}

export async function backendRetryGeneration(id: string): Promise<void> {
  await backendRequest(`/api/kits/${encodeURIComponent(id)}/generation/retry`, { method: "POST" });
}

export async function backendRegenerateSection(id: string, section: "overview" | "topics" | "rounds" | "questions" | "flashcards" | "schedule", category?: "technical" | "behavioural" | "system-design" | "company-fit", mode?: "append_fresh", sessionId?: string): Promise<void> {
  await backendRequest(`/api/kits/${encodeURIComponent(id)}/generation/sections/${section}/regenerate`, { method: "POST", ...(section === "questions" && (category || mode || sessionId) ? { body: JSON.stringify({ category, mode, session_id: sessionId }) } : {}) });
}

export async function backendFetchScheduleProgress(id: string): Promise<{ day: number; status: "not_started" | "in_progress" | "completed" }[]> {
  const result = await backendRequest<{ days: { day: number; status: "not_started" | "in_progress" | "completed" }[] }>(`/api/kits/${encodeURIComponent(id)}/schedule/progress`);
  return result.days;
}

export async function backendSetScheduleProgress(id: string, day: number, completed: boolean): Promise<void> {
  await backendRequest(`/api/kits/${encodeURIComponent(id)}/schedule/${day}/progress`, { method: "PATCH", body: JSON.stringify({ status: completed ? "completed" : "not_started" }) });
}

export async function backendFetchKitData(id: string): Promise<{ data: KitData; version: number }> {
  const result = await backendRequest<{ data: unknown; version: number }>(`/api/kits/${encodeURIComponent(id)}/data`);
  return { data: kitDataSchema.parse(result.data), version: result.version };
}

export function backendPatchKitData(id: string, data: KitData, version: number): Promise<{ data: KitData; version: number }> {
  return backendRequest<{ data: KitData; version: number }>(`/api/kits/${encodeURIComponent(id)}/data`, {
    method: "PATCH",
    body: JSON.stringify({ data, version }),
  }).then((result) => {
    return { ...result, data: kitDataSchema.parse(result.data) };
  });
}

export function backendUpdateKit(id: string, patch: Partial<Pick<BackendKit, "title" | "company" | "role" | "interviewDate" | "notes">>): Promise<BackendKit> {
  return backendRequest<{ kit: unknown }>(`/api/kits/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  }).then((result) => kitSchema.parse(result.kit));
}

export function backendDeleteKit(id: string): Promise<void> {
  return backendRequest<void>(`/api/kits/${encodeURIComponent(id)}`, { method: "DELETE" });
}
