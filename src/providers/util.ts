import { classifyMessage, describeError } from "../pipeline/failure.js";
import type { ProviderOutcome } from "./types.js";

export function errorOutcome(err: unknown): ProviderOutcome {
  const { error, reason } = describeError(err);
  return { kind: "error", reason, message: error };
}

export function httpError(provider: string, status: number): ProviderOutcome {
  const message = `${provider}: HTTP ${status}`;
  // 402 from a metered API means the plan or quota is the problem, not a bot wall.
  return { kind: "error", reason: status === 402 ? "rate_limited" : classifyMessage(message), message };
}

export function clipText(text: string, max = 1500): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}
