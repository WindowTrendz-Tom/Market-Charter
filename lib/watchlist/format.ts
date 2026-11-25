const priceFormats = [2, 4].map(
  (max) => new Intl.NumberFormat("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: max }),
);

const pctFormat = new Intl.NumberFormat("en-NZ", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
});

export function formatPrice(v: number): string {
  return priceFormats[Math.abs(v) < 1 ? 1 : 0].format(v);
}

/** `pct` is in percent (1.5 = +1.5%). */
export function formatChangePct(pct: number | null): string {
  return pct === null ? "—" : pctFormat.format(pct / 100);
}

export function changeClass(pct: number | null): "up" | "down" | "flat" {
  if (pct === null || pct === 0) return "flat";
  return pct > 0 ? "up" : "down";
}
