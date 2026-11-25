import type { CandleStore } from "@/lib/cache/candle-store";
import { CREDITS_PER_DAY, CREDITS_PER_MINUTE } from "./limits";
import { LIMIT_MESSAGES } from "./messages";

const MINUTE_MS = 60_000;
const MINUTE_RETRY_SECONDS = 60;

export interface BudgetRefusal {
  kind: "minute" | "day";
  message: string;
  retryAfterSeconds: number;
}

export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function secondsUntilNextUtcMidnight(now: Date): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}

/**
 * Local guard on the shared Twelve Data budget (all logged credits, all symbols and call types).
 * Returns null when a call may go ahead. Writes nothing.
 */
export async function checkCreditBudget(
  store: Pick<CandleStore, "sumCreditsSince">,
  now: Date,
): Promise<BudgetRefusal | null> {
  const minuteCredits = await store.sumCreditsSince(new Date(now.getTime() - MINUTE_MS));
  if (minuteCredits >= CREDITS_PER_MINUTE) {
    return { kind: "minute", message: LIMIT_MESSAGES.minute, retryAfterSeconds: MINUTE_RETRY_SECONDS };
  }
  const dayCredits = await store.sumCreditsSince(startOfUtcDay(now));
  if (dayCredits >= CREDITS_PER_DAY) {
    return { kind: "day", message: LIMIT_MESSAGES.day, retryAfterSeconds: secondsUntilNextUtcMidnight(now) };
  }
  return null;
}
