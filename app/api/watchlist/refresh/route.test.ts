import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ErrorResponse } from "@/lib/candles/api-types";
import { ConfigError } from "@/lib/env";
import type { WatchlistRefreshResponse } from "@/lib/watchlist/api-types";
import { POST } from "./route";

vi.mock("@/lib/auth/session", () => ({ getAuthContext: vi.fn() }));
vi.mock("@/lib/watchlist/deps", () => ({ buildWatchlistDeps: vi.fn() }));
vi.mock("@/lib/watchlist/watchlist-service", () => ({ refreshWatchlistSymbol: vi.fn() }));

const { getAuthContext } = await import("@/lib/auth/session");
const { buildWatchlistDeps } = await import("@/lib/watchlist/deps");
const { refreshWatchlistSymbol } = await import("@/lib/watchlist/watchlist-service");
const auth = vi.mocked(getAuthContext);
const deps = vi.mocked(buildWatchlistDeps);
const refresh = vi.mocked(refreshWatchlistSymbol);

const url = "http://localhost/api/watchlist/refresh";
const post = (body: string) =>
  POST(new Request(url, { method: "POST", body, headers: { "Content-Type": "application/json" } }));

beforeEach(() => {
  for (const m of [auth, deps, refresh]) m.mockReset();
  auth.mockResolvedValue({ supabase: {} as never, user: { id: "u1", email: null } });
  deps.mockReturnValue({ fake: "deps" } as never);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/watchlist/refresh", () => {
  it("returns 401 without a user and calls nothing", async () => {
    auth.mockResolvedValue({ supabase: {} as never, user: null });
    const res = await post('{"symbol":"AAPL"}');
    expect(res.status).toBe(401);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(deps).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("returns 500 config without naming variables", async () => {
    deps.mockImplementation(() => {
      throw new ConfigError(["SUPABASE_SECRET_KEY"]);
    });
    const res = await post('{"symbol":"AAPL"}');
    const text = await res.text();
    expect(res.status).toBe(500);
    expect((JSON.parse(text) as ErrorResponse).error.code).toBe("config");
    expect(text).not.toContain("SUPABASE_SECRET_KEY");
  });

  it("returns 400 invalid_body for bad JSON", async () => {
    const res = await post("{oops");
    expect(res.status).toBe(400);
    expect(((await res.json()) as ErrorResponse).error.code).toBe("invalid_body");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("returns 200 with item, source and notice", async () => {
    const notice = { code: "rate_limited", message: "hello" } as const;
    const item = { symbol: "AAPL", quote: null };
    refresh.mockResolvedValue({ ok: true, item, source: "api", notice });
    const res = await post('{"symbol":"AAPL"}');
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect((await res.json()) as WatchlistRefreshResponse).toEqual({ item, source: "api", notice });
    expect(refresh.mock.calls[0][0]).toBe("AAPL");
  });

  it("maps a busy failure to 503 with Retry-After 3", async () => {
    refresh.mockResolvedValue({
      ok: false,
      status: 503,
      error: { code: "busy", message: "busy" },
      retryAfterSeconds: 3,
    });
    const res = await post('{"symbol":"AAPL"}');
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("3");
  });

  it("returns a generic 500 with no stack for an unexpected throw", async () => {
    refresh.mockRejectedValue(new Error("boom at x.ts:1"));
    const res = await post('{"symbol":"AAPL"}');
    const text = await res.text();
    expect(res.status).toBe(500);
    expect(text).not.toContain("boom");
  });
});
