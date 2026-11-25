import { describe, expect, it, vi } from "vitest";
import { AUTH_RETRY_DELAY_MS, fetchWithAuthRetry } from "./fetch-with-auth-retry";

function deps(...statuses: number[]) {
  const fetchFn = vi.fn();
  for (const s of statuses) fetchFn.mockResolvedValueOnce(new Response(null, { status: s }));
  const sleep = vi.fn().mockResolvedValue(undefined);
  return { fetch: fetchFn as unknown as typeof fetch, sleep, fetchFn };
}

describe("fetchWithAuthRetry", () => {
  it("makes one call on 200", async () => {
    const d = deps(200);
    const res = await fetchWithAuthRetry("/x", undefined, d);
    expect(res.status).toBe(200);
    expect(d.fetchFn).toHaveBeenCalledTimes(1);
    expect(d.sleep).not.toHaveBeenCalled();
  });
  it("retries once after a 401", async () => {
    const d = deps(401, 200);
    const res = await fetchWithAuthRetry("/x", undefined, d);
    expect(res.status).toBe(200);
    expect(d.fetchFn).toHaveBeenCalledTimes(2);
    expect(d.sleep).toHaveBeenCalledWith(AUTH_RETRY_DELAY_MS);
    expect(AUTH_RETRY_DELAY_MS).toBe(1000);
  });
  it("returns the second 401 after two calls", async () => {
    const d = deps(401, 401);
    const res = await fetchWithAuthRetry("/x", undefined, d);
    expect(res.status).toBe(401);
    expect(d.fetchFn).toHaveBeenCalledTimes(2);
  });
  it("propagates network errors", async () => {
    const d = { fetch: vi.fn().mockRejectedValue(new Error("net")) as unknown as typeof fetch, sleep: vi.fn() };
    await expect(fetchWithAuthRetry("/x", undefined, d)).rejects.toThrow("net");
  });
});
