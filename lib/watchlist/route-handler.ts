import "server-only";
import { getAuthContext } from "@/lib/auth/session";
import { ConfigError } from "@/lib/env";
import { errorJson } from "@/lib/http/json";
import { buildWatchlistDeps } from "./deps";
import type { ChartCandlesFailure } from "@/lib/candles/get-chart-candles";
import type { WatchlistDeps, WatchlistFailure } from "./watchlist-service";

export function failureJson(f: WatchlistFailure | ChartCandlesFailure): Response {
  return errorJson(f.status, f.error.code, f.error.message, f.retryAfterSeconds);
}

/** Parses a JSON object body. Returns null when the body is not valid JSON or not an object. */
export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export const invalidBodyJson = (): Response => errorJson(400, "invalid_body", "Request body is not valid.");

/** Shared flow: auth (401), deps (config errors give 500), then `run`. Any other throw gives a generic 500. */
export async function withWatchlistDeps(run: (deps: WatchlistDeps) => Promise<Response>): Promise<Response> {
  try {
    const { supabase, user } = await getAuthContext();
    if (!user) return errorJson(401, "unauthorized", "Log in to use the watchlist.");
    return await run(buildWatchlistDeps(supabase));
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error("Missing env:", err.missing);
      return errorJson(500, "config", "Server configuration is incomplete.");
    }
    console.error("Watchlist route error:", err instanceof Error ? err.message : "unknown error");
    return errorJson(500, "provider_error", "Something went wrong with the watchlist. Check the server logs.");
  }
}
