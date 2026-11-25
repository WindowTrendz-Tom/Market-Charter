import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type CookieOptions = Record<string, unknown>;
interface CookieMethods {
  getAll(): { name: string; value: string }[];
  setAll(cookies: { name: string; value: string; options: CookieOptions }[], headers: Record<string, string>): void;
}

const state = vi.hoisted(() => ({
  claims: null as { sub: string } | null,
  onGetClaims: null as ((methods: CookieMethods) => void) | null,
  methods: null as CookieMethods | null,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, opts: { cookies: CookieMethods }) => {
    state.methods = opts.cookies;
    return {
      auth: {
        getClaims: async () => {
          state.onGetClaims?.(opts.cookies);
          return { data: state.claims ? { claims: state.claims } : null, error: null };
        },
      },
    };
  },
}));

import { updateSession } from "@/lib/supabase/proxy";

const URL_VALUE = "https://secret-host-example.supabase.co";
const KEY_VALUE = "sb_publishable_secretvalue";

beforeEach(() => {
  state.claims = null;
  state.onGetClaims = null;
  state.methods = null;
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL_VALUE);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", KEY_VALUE);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const req = (path: string) => new NextRequest(`http://localhost${path}`);
const refresh = (m: CookieMethods) =>
  m.setAll([{ name: "sb-x-auth-token", value: "v", options: { path: "/" } }], {
    "Cache-Control": "private, no-store",
  });

describe("updateSession", () => {
  it("redirects a logged-out page request to /login with next", async () => {
    const res = await updateSession(req("/chart/AAPL"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toMatch(/\/login\?next=%2Fchart%2FAAPL$/);
  });

  it("passes /api/ through when logged out", async () => {
    const res = await updateSession(req("/api/watchlist"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("redirects a logged-in /login request to /", async () => {
    state.claims = { sub: "user-1" };
    const res = await updateSession(req("/login"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location") ?? "").pathname).toBe("/");
  });

  it("lets a logged-in page request through", async () => {
    state.claims = { sub: "user-1" };
    const res = await updateSession(req("/chart/AAPL"));
    expect(res.status).toBe(200);
  });

  it("keeps refreshed cookies and cache headers on a pass-through response", async () => {
    state.claims = { sub: "user-1" };
    state.onGetClaims = refresh;
    const res = await updateSession(req("/chart/AAPL"));
    expect(res.headers.get("set-cookie")).toContain("sb-x-auth-token=v");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("keeps refreshed cookies and cache headers on a redirect response", async () => {
    state.onGetClaims = refresh;
    const res = await updateSession(req("/chart/AAPL"));
    expect(res.status).toBe(307);
    expect(res.headers.get("set-cookie")).toContain("sb-x-auth-token=v");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("returns 500 JSON for /api/ when env is missing, without leaking values", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await updateSession(req("/api/watchlist"));
    expect(res.status).toBe(500);
    const body = await res.text();
    expect(JSON.parse(body).error.code).toBe("config");
    expect(body).not.toContain(KEY_VALUE);
  });

  it("returns a plain 500 for pages when env is missing, without leaking values", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await updateSession(req("/chart/AAPL"));
    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).toBe("Server configuration is incomplete.");
    expect(body).not.toContain(URL_VALUE);
  });
});
