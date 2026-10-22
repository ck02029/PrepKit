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

export async function retryWithinDeadline<T>(
  attempt: () => Promise<T | null>,
  nextRetryAt: () => Promise<number | null>,
  deadline: number,
  wait: (milliseconds: number) => Promise<void> = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  now: () => number = Date.now,
): Promise<T | null> {
  while (now() < deadline) {
    const result = await attempt();
    if (result !== null) return result;
    const retryAt = await nextRetryAt();
    if (retryAt === null) return null;
    const delay = Math.max(500, retryAt - now());
    if (now() + delay >= deadline) return null;
    await wait(delay);
  }
  return null;
}
