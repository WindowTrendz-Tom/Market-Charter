const MAX_NEXT_PATH_LENGTH = 200;

/** Returns `raw` only if it is a safe same-site path; otherwise "/". */
export function safeNextPath(raw: unknown): string {
  if (typeof raw !== "string") return "/";
  if (raw.length < 1 || raw.length > MAX_NEXT_PATH_LENGTH) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  if (raw.includes("\\")) return "/";
  // Tab, CR and LF are stripped by URL parsers, so "/\t/evil.com" would become "//evil.com".
  if (/[\u0000-\u001F\u007F]/.test(raw)) return "/";
  if (raw.startsWith("/login")) return "/";
  return raw;
}
