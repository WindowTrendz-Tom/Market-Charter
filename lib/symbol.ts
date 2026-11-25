const SYMBOL_PATTERN = /^[A-Z][A-Z0-9.-]{0,9}$/;

export function normaliseSymbol(raw: string): string | null {
  const symbol = raw.trim().toUpperCase();
  return SYMBOL_PATTERN.test(symbol) ? symbol : null;
}
