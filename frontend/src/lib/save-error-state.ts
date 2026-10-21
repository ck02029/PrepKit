export type SaveErrorState = "conflict" | "error";

export function saveErrorState(error: unknown): SaveErrorState {
  return typeof error === "object" && error !== null && "status" in error && error.status === 409 ? "conflict" : "error";
}
