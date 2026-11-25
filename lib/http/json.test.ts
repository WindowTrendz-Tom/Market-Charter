import { describe, expect, it } from "vitest";
import { errorJson, jsonNoStore } from "./json";

describe("jsonNoStore", () => {
  it("defaults to 200 with no-store", async () => {
    const res = jsonNoStore({ a: 1 });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ a: 1 });
  });
  it("uses the given status", () => {
    expect(jsonNoStore({}, 201).status).toBe(201);
  });
});

describe("errorJson", () => {
  it("sets status, body and no-store without Retry-After", async () => {
    const res = errorJson(401, "unauthorized", "Log in.");
    expect(res.status).toBe(401);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Retry-After")).toBeNull();
    expect(await res.json()).toEqual({ error: { code: "unauthorized", message: "Log in." } });
  });
  it("sets Retry-After when given, including 0", () => {
    expect(errorJson(429, "rate_limited", "x", 60).headers.get("Retry-After")).toBe("60");
    expect(errorJson(429, "rate_limited", "x", 0).headers.get("Retry-After")).toBe("0");
  });
});
