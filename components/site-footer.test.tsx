import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SiteFooter } from "./site-footer";

describe("SiteFooter", () => {
  it("carries the TradingView attribution and link", () => {
    const html = renderToStaticMarkup(<SiteFooter />);
    expect(html).toContain("TradingView Lightweight Charts™ Copyright (c) 2025 TradingView, Inc.");
    expect(html).toContain('href="https://www.tradingview.com/"');
    expect(html).toContain("Pacific/Auckland");
  });
});
