import type { SymbolMatch } from "@/lib/data-provider/types";

export const US_MIC_CODES: ReadonlySet<string> = new Set(["XNAS", "XNGS", "XNMS", "XNCM", "XNYS", "ARCX", "BATS", "XASE", "IEXG"]);
export const US_COUNTRY = "United States";

export type UsListingResult =
  | { kind: "us"; match: SymbolMatch }
  | { kind: "non_us"; exchanges: string[] }
  | { kind: "none" };

function isUs(m: SymbolMatch): boolean {
  return m.country === US_COUNTRY || (m.micCode !== null && US_MIC_CODES.has(m.micCode));
}

function exchangeLabel(m: SymbolMatch): string {
  return m.exchange ?? m.micCode ?? "unknown";
}

/** Exact symbol match only (case-insensitive). Prefers Common Stock, then ETF, then the first US listing. */
export function pickUsListing(symbol: string, matches: SymbolMatch[]): UsListingResult {
  const wanted = symbol.toUpperCase();
  const exact = matches.filter((m) => m.symbol.toUpperCase() === wanted);
  if (exact.length === 0) return { kind: "none" };
  const us = exact.filter(isUs);
  if (us.length > 0) {
    const match =
      us.find((m) => m.instrumentType === "Common Stock") ?? us.find((m) => m.instrumentType === "ETF") ?? us[0];
    return { kind: "us", match };
  }
  return { kind: "non_us", exchanges: [...new Set(exact.map(exchangeLabel))].slice(0, 3) };
}

/** e.g. "AAPL@NASDAQ(United States), AAPL@BMV(Mexico)", or "no matches". */
export function summariseMatches(matches: SymbolMatch[], max = 5): string {
  if (matches.length === 0) return "no matches";
  return matches
    .slice(0, max)
    .map((m) => `${m.symbol}@${exchangeLabel(m)}(${m.country ?? "unknown"})`)
    .join(", ");
}
