import type { QueryClient } from "@tanstack/react-query";

let activeQueryClient: QueryClient | undefined;

export function registerApiQueryClient(queryClient: QueryClient): void {
  activeQueryClient = queryClient;
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}, queryClient?: QueryClient): Promise<Response> {
  const response = await fetch(input, { ...init, credentials: "include" });
  if (response.status === 401) {
    (queryClient ?? activeQueryClient)?.clear();
    if (typeof window !== "undefined") window.location.assign("/login?expired=1");
  }
  return response;
}
