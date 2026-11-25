import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const lines = readFileSync(join(process.cwd(), ".env.example"), "utf8")
  .split(/\r?\n/)
  .filter((line) => line.trim() !== "" && !line.trim().startsWith("#"));
const entries = lines.map((line) => {
  const i = line.indexOf("=");
  return { key: line.slice(0, i), value: line.slice(i + 1) };
});

describe(".env.example", () => {
  it("lists the required keys", () => {
    const keys = entries.map((e) => e.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "TWELVE_DATA_API_KEY",
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
        "SUPABASE_SECRET_KEY",
      ]),
    );
  });

  it("has an empty value on every line", () => {
    for (const e of entries) expect(e.value, e.key).toBe("");
  });

  it("only exposes the Supabase URL and publishable key as NEXT_PUBLIC_", () => {
    const publicKeys = entries.map((e) => e.key).filter((k) => k.startsWith("NEXT_PUBLIC_"));
    expect(publicKeys).toEqual(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]);
  });
});
