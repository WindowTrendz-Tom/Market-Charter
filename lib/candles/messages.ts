/** User-facing messages shared by every service that spends Twelve Data credits. */
export const LIMIT_MESSAGES = {
  minute: "Twelve Data's free-plan limit (8 calls a minute) has been reached. Try again in about a minute.",
  day: "Twelve Data's daily limit (800 calls) has been reached. It resets at midnight UTC (1 pm NZDT / 12 pm NZST).",
  provider: "Twelve Data says the free-plan limit has been reached. Try again in about a minute.",
} as const;

export const CACHE_UNAVAILABLE_MESSAGE = "The price cache (Supabase) isn't reachable right now. Try again shortly.";
