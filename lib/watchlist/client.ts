import type { ErrorCode, ErrorResponse } from "@/lib/candles/api-types";
import { fetchWithAuthRetry } from "@/lib/http/fetch-with-auth-retry";
import type {
  WatchlistItem,
  WatchlistItemResponse,
  WatchlistRefreshResponse,
  WatchlistResponse,
} from "./api-types";

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: ErrorCode | null; message: string };

export type RefreshOutcome =
  | { kind: "fetched" | "cached"; item: WatchlistItem }
  | { kind: "busy" }
  | { kind: "limited"; message: string; item: WatchlistItem | null }
  | { kind: "failed"; message: string }
  | { kind: "unauthorized" };

interface Deps {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
}

const defaultDeps: Deps = {
  fetch: (input, init) => fetch(input, init),
  sleep: (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
};

const NETWORK_MESSAGE = "Couldn't reach the server.";
const UNAUTHORIZED_MESSAGE = "Your session has expired. Log in again.";
const GENERIC_MESSAGE = "Something went wrong. Try again.";
const UNEXPECTED_MESSAGE = "Unexpected response from the server.";

async function readError(res: Response): Promise<{ code: ErrorCode | null; message: string }> {
  try {
    const body = (await res.json()) as Partial<ErrorResponse> | null;
    return { code: body?.error?.code ?? null, message: body?.error?.message ?? GENERIC_MESSAGE };
  } catch {
    return { code: null, message: GENERIC_MESSAGE };
  }
}

async function request<T>(deps: Deps, url: string, init?: RequestInit): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetchWithAuthRetry(url, init, deps);
  } catch {
    return { ok: false, status: 0, code: null, message: NETWORK_MESSAGE };
  }
  if (res.status === 401) {
    return { ok: false, status: 401, code: "unauthorized", message: UNAUTHORIZED_MESSAGE };
  }
  if (!res.ok) {
    const { code, message } = await readError(res);
    return { ok: false, status: res.status, code, message };
  }
  if (res.status === 204) return { ok: true, data: null as T };
  try {
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, status: 0, code: null, message: UNEXPECTED_MESSAGE };
  }
}

function jsonInit(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export function createWatchlistClient(deps: Deps = defaultDeps) {
  return {
    list: () => request<WatchlistResponse>(deps, "/api/watchlist"),
    add: (symbol: string) => request<WatchlistItemResponse>(deps, "/api/watchlist", jsonInit("POST", { symbol })),
    remove: (symbol: string) =>
      request<null>(deps, `/api/watchlist?symbol=${encodeURIComponent(symbol)}`, { method: "DELETE" }),
    saveOrder: (symbols: string[]) =>
      request<WatchlistResponse>(deps, "/api/watchlist", jsonInit("PATCH", { symbols })),
    refresh: (symbol: string) =>
      request<WatchlistRefreshResponse>(deps, "/api/watchlist/refresh", jsonInit("POST", { symbol })),
  };
}

export type WatchlistClient = ReturnType<typeof createWatchlistClient>;

export function toRefreshOutcome(r: ApiResult<WatchlistRefreshResponse>): RefreshOutcome {
  if (r.ok) {
    const { item, source, notice } = r.data;
    if (notice?.code === "rate_limited") return { kind: "limited", message: notice.message, item };
    if (notice?.code === "busy") return { kind: "busy" };
    if (source === "api") return { kind: "fetched", item };
    if (notice) return { kind: "failed", message: notice.message };
    return { kind: "cached", item };
  }
  if (r.status === 429) return { kind: "limited", message: r.message, item: null };
  if (r.status === 503 && r.code === "busy") return { kind: "busy" };
  if (r.status === 401) return { kind: "unauthorized" };
  return { kind: "failed", message: r.message };
}
