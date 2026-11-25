import { describe, expect, it } from "vitest";
import fixture from "@/test/fixtures/twelve-data-symbol-search.json";
import type { SymbolMatch } from "@/lib/data-provider/types";
import { pickUsListing, summariseMatches } from "./us-listing";

// synthetic test data
const make = (o: Partial<SymbolMatch>): SymbolMatch => ({
  symbol: "AAPL",
  name: null,
  exchange: "NASDAQ",
  micCode: "XNGS",
  country: "United States",
  instrumentType: "Common Stock",
  currency: "USD",
  ...o,
});

const fixtureMatches: SymbolMatch[] = fixture.data
  .filter((d) => "symbol" in d)
  .map((d) => ({
    symbol: d.symbol as string,
    name: d.instrument_name,
    exchange: d.exchange,
    micCode: d.mic_code,
    country: d.country,
    instrumentType: d.instrument_type,
    currency: d.currency,
  }));

describe("pickUsListing", () => {
  it("finds the US listing in the fixture", () => {
    const r = pickUsListing("AAPL", fixtureMatches);
    expect(r.kind).toBe("us");
    if (r.kind === "us") expect(r.match.exchange).toBe("NASDAQ");
  });

  it("is case-insensitive on the symbol", () => {
    expect(pickUsListing("aapl", fixtureMatches).kind).toBe("us");
  });

  it("reports non_us when only a foreign listing matches", () => {
    expect(pickUsListing("AAPL", [make({ exchange: "BMV", micCode: "XMEX", country: "Mexico" })])).toEqual({
      kind: "non_us",
      exchanges: ["BMV"],
    });
  });

  it("returns none for no matches", () => {
    expect(pickUsListing("AAPL", [])).toEqual({ kind: "none" });
  });

  it("requires an exact symbol match", () => {
    expect(pickUsListing("APL", fixtureMatches)).toEqual({ kind: "none" });
    expect(pickUsListing("APLE", fixtureMatches).kind).toBe("us");
  });

  it("accepts a US mic code when country is null", () => {
    const r = pickUsListing("AAPL", [make({ country: null, micCode: "XNYS", exchange: "NYSE" })]);
    expect(r.kind).toBe("us");
  });

  it("prefers Common Stock over ETF, then ETF over other types", () => {
    const etf = make({ instrumentType: "ETF", exchange: "NYSE", micCode: "ARCX" });
    const stock = make({ instrumentType: "Common Stock" });
    const r = pickUsListing("AAPL", [etf, stock]);
    expect(r.kind === "us" && r.match.instrumentType).toBe("Common Stock");
    const reit = make({ instrumentType: "REIT" });
    const r2 = pickUsListing("AAPL", [reit, etf]);
    expect(r2.kind === "us" && r2.match.instrumentType).toBe("ETF");
  });

  it("limits non_us exchanges to 3 unique entries", () => {
    const list = ["A", "B", "B", "C", "D"].map((e) => make({ exchange: e, micCode: null, country: "X" }));
    const r = pickUsListing("AAPL", list);
    expect(r).toEqual({ kind: "non_us", exchanges: ["A", "B", "C"] });
  });
});

describe("summariseMatches", () => {
  it("formats matches", () => {
    expect(summariseMatches(fixtureMatches.slice(0, 2))).toBe("AAPL@NASDAQ(United States), AAPL@BMV(Mexico)");
  });
  it("says no matches for an empty list", () => {
    expect(summariseMatches([])).toBe("no matches");
  });
  it("caps at 5 items", () => {
    const many = Array.from({ length: 8 }, (_, i) => make({ symbol: `S${i}` }));
    expect(summariseMatches(many).split(", ")).toHaveLength(5);
  });
});
