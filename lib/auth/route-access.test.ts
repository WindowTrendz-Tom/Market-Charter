import { describe, expect, it } from "vitest";
import { decideAccess } from "@/lib/auth/route-access";

const next = { action: "next" };

describe("decideAccess", () => {
  it("lets /api/ through without a user", () => {
    expect(decideAccess({ pathname: "/api/candles/AAPL", search: "", hasUser: false })).toEqual(next);
  });

  it("lets /api/ through with a user", () => {
    expect(decideAccess({ pathname: "/api/watchlist", search: "", hasUser: true })).toEqual(next);
  });

  it("shows /login to logged-out users and bounces logged-in users to /", () => {
    expect(decideAccess({ pathname: "/login", search: "", hasUser: false })).toEqual(next);
    expect(decideAccess({ pathname: "/login", search: "?next=/x", hasUser: true })).toEqual({
      action: "redirect",
      location: "/",
    });
  });

  it("sends logged-out / to plain /login", () => {
    expect(decideAccess({ pathname: "/", search: "", hasUser: false })).toEqual({
      action: "redirect",
      location: "/login",
    });
  });

  it("sends other logged-out pages to /login with next", () => {
    expect(decideAccess({ pathname: "/chart/AAPL", search: "", hasUser: false })).toEqual({
      action: "redirect",
      location: "/login?next=%2Fchart%2FAAPL",
    });
    expect(decideAccess({ pathname: "/", search: "?a=1", hasUser: false })).toEqual({
      action: "redirect",
      location: "/login?next=%2F%3Fa%3D1",
    });
  });

  it("lets logged-in users through", () => {
    expect(decideAccess({ pathname: "/chart/AAPL", search: "", hasUser: true })).toEqual(next);
  });
});
