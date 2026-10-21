export class TransientGenerationError extends Error {
  constructor(message: string, readonly retryAfterMs?: number) {
    super(message);
    this.name = "TransientGenerationError";
  }
}

export function retryDelayMs(attempt: number, baseMs = 1_000, maxMs = 60_000): number {
  const safeAttempt = Math.max(1, Math.floor(attempt));
  return Math.min(maxMs, baseMs * 2 ** Math.min(safeAttempt - 1, 20));
}

export function isTransientGenerationError(error: unknown): error is TransientGenerationError {
  if (error instanceof TransientGenerationError) return true;
  if (!error || typeof error !== "object") return false;
  const code = String((error as { code?: unknown }).code ?? "");
  return /^(08|40|53|54|57|58)/.test(code) || ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EPIPE", "EHOSTUNREACH", "ENETUNREACH"].includes(code);
}
