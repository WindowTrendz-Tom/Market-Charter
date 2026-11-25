import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ErrorResponse } from "@/lib/candles/api-types";
import { ConfigError } from "@/lib/env";
import type { WatchlistItem, WatchlistItemResponse, WatchlistResponse } from "@/lib/watchlist/api-types";
import type { WatchlistFailure } from "@/lib/watchlist/watchlist-service";
import { DELETE, GET, PATCH, POST } from "./route";

vi.mock("@/lib/auth/session", () => ({ getAuthContext: vi.fn() }));
vi.mock("@/lib/watchlist/deps", () => ({ buildWatchlistDeps: vi.fn() }));
vi.mock("@/lib/watchlist/watchlist-service", () => ({
  listWatchlist: vi.fn(),
  addToWatchlist: vi.fn(),
  removeFromWatchlist: vi.fn(),
  reorderWatchlist: vi.fn(),
}));

const { getAuthContext } = await import("@/lib/auth/session");
const { buildWatchlistDeps } = await import("@/lib/watchlist/deps");
const service = await import("@/lib/watchlist/watchlist-service");
const auth = vi.mocked(getAuthContext);
const deps = vi.mocked(buildWatchlistDeps);
const list = vi.mocked(service.listWatchlist);
const add = vi.mocked(service.addToWatchlist);
const remove = vi.mocked(service.removeFromWatchlist);
const reorder = vi.mocked(service.reorderWatchlist);

const item: WatchlistItem = { symbol: "AAPL", quote: null };
const url = "http://localhost/api/watchlist";

function failure(status: WatchlistFailure["status"], code: WatchlistFailure["error"]["code"], retry: number | null = null): WatchlistFailure {
  return { ok: false, status, error: { code, message: "msg" }, retryAfterSeconds: retry };
}
const json = (method: string, body: string) =>
  new Request(url, { method, body, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  for (const m of [auth, deps, list, add, remove, reorder]) m.mockReset();
  auth.mockResolvedValue({ supabase: {} as never, user: { id: "u1", email: null } });
  deps.mockReturnValue({ fake: "deps" } as never);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("/api/watchlist auth and errors", () => {
  it.each([
    ["GET", () => GET()],
    ["POST", () => POST(json("POST", '{"symbol":"AAPL"}'))],
    ["DELETE", () => DELETE(new Request(`${url}?symbol=AAPL`, { method: "DELETE" }))],
    ["PATCH", () => PATCH(json("PATCH", '{"symbols":[]}'))],
  ])("%s without a user returns 401 no-store and calls nothing", async (_m, call) => {
    auth.mockResolvedValue({ supabase: {} as never, user: null });
    const res = await call();
    expect(res.status).toBe(401);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(((await res.json()) as ErrorResponse).error.code).toBe("unauthorized");
    expect(deps).not.toHaveBeenCalled();
    for (const s of [list, add, remove, reorder]) expect(s).not.toHaveBeenCalled();
  });

  it("returns 500 config without naming variables when deps throw ConfigError", async () => {
    deps.mockImplementation(() => {
      throw new ConfigError(["TWELVE_DATA_API_KEY"]);
    });
    const res = await GET();
    const text = await res.text();
    expect(res.status).toBe(500);
    expect((JSON.parse(text) as ErrorResponse).error.code).toBe("config");
    expect(text).not.toContain("TWELVE_DATA_API_KEY");
    expect(list).not.toHaveBeenCalled();
  });

  it("returns a generic 500 with no stack for an unexpected throw", async () => {
    list.mockRejectedValue(new Error("boom at secret/path.ts:12"));
    const res = await GET();
    const text = await res.text();
    expect(res.status).toBe(500);
    expect((JSON.parse(text) as ErrorResponse).error.code).toBe("provider_error");
    expect(text).not.toContain("boom");
    expect(text).not.toContain("path.ts");
  });
});

describe("GET /api/watchlist", () => {
  it("returns the items", async () => {
    list.mockResolvedValue({ ok: true, items: [item] });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect((await res.json()) as WatchlistResponse).toEqual({ items: [item] });
  });
});

describe("POST /api/watchlist", () => {
  it("returns 201 with the item", async () => {
    add.mockResolvedValue({ ok: true, item });
    const res = await POST(json("POST", '{"symbol":"AAPL"}'));
    expect(res.status).toBe(201);
    expect((await res.json()) as WatchlistItemResponse).toEqual({ item });
    expect(add.mock.calls[0][0]).toBe("AAPL");
  });

  it.each(["{not json", "42", "[]", "null"])("returns 400 invalid_body for body %s", async (body) => {
    const res = await POST(json("POST", body));
    expect(res.status).toBe(400);
    expect(((await res.json()) as ErrorResponse).error.code).toBe("invalid_body");
    expect(add).not.toHaveBeenCalled();
  });

  it("maps a 429 failure to status and Retry-After", async () => {
    add.mockResolvedValue(failure(429, "rate_limited", 60));
    const res = await POST(json("POST", '{"symbol":"AAPL"}'));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
  });
});

describe("DELETE /api/watchlist", () => {
  it("returns 204 with no body", async () => {
    remove.mockResolvedValue({ ok: true });
    const res = await DELETE(new Request(`${url}?symbol=AAPL`, { method: "DELETE" }));
    expect(res.status).toBe(204);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.text()).toBe("");
    expect(remove.mock.calls[0][0]).toBe("AAPL");
  });

  it("returns the 404 body when the symbol is missing", async () => {
    remove.mockResolvedValue(failure(404, "not_found"));
    const res = await DELETE(new Request(`${url}?symbol=AAPL`, { method: "DELETE" }));
    expect(res.status).toBe(404);
    expect(((await res.json()) as ErrorResponse).error).toEqual({ code: "not_found", message: "msg" });
  });

  it("passes null to the service when ?symbol is absent", async () => {
    remove.mockResolvedValue(failure(400, "invalid_symbol"));
    const res = await DELETE(new Request(url, { method: "DELETE" }));
    expect(res.status).toBe(400);
    expect(remove.mock.calls[0][0]).toBeNull();
  });
});

describe("PATCH /api/watchlist", () => {
  it("saves then re-lists and returns the items", async () => {
    reorder.mockResolvedValue({ ok: true });
    list.mockResolvedValue({ ok: true, items: [item] });
    const res = await PATCH(json("PATCH", '{"symbols":["AAPL"]}'));
    expect(res.status).toBe(200);
    expect((await res.json()) as WatchlistResponse).toEqual({ items: [item] });
    expect(reorder.mock.calls[0][0]).toEqual(["AAPL"]);
    expect(reorder.mock.invocationCallOrder[0]).toBeLessThan(list.mock.invocationCallOrder[0]);
  });

  it("passes a 409 through without re-listing", async () => {
    reorder.mockResolvedValue(failure(409, "invalid_body"));
    const res = await PATCH(json("PATCH", '{"symbols":["AAPL"]}'));
    expect(res.status).toBe(409);
    expect(list).not.toHaveBeenCalled();
  });

  it("returns 400 invalid_body for bad JSON", async () => {
    const res = await PATCH(json("PATCH", "nope"));
    expect(res.status).toBe(400);
    expect(reorder).not.toHaveBeenCalled();
  });
});
