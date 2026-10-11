import type { FailureReason } from "../pipeline/failure.js";

// Circuit breaker shared by search providers and source-chain providers: after
// a provider fails, later calls skip it for a while instead of hitting the same
// wall. The state is process-wide, so it also covers resume_research.
const BLOCKED_COOLDOWN_MS = 5 * 60_000;
const DEFAULT_COOLDOWN_MS = 60_000;
const failedUntil = new Map<string, { until: number; error: string }>();

export function coolingDown(key: string): string | null {
  const down = failedUntil.get(key);
  return down && down.until > Date.now() ? down.error : null;
}

export function markFailed(key: string, reason: FailureReason, error: string): void {
  const cooldown = reason === "bot_blocked" ? BLOCKED_COOLDOWN_MS : DEFAULT_COOLDOWN_MS;
  failedUntil.set(key, { until: Date.now() + cooldown, error });
}

export function resetHealth(): void {
  failedUntil.clear();
}
