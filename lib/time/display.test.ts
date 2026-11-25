import { describe, expect, it } from "vitest";
import { formatNzDate, formatNzDateTime, nzTickMarkLabel } from "./display";

const norm = (s: string): string => s.replace(/\s/g, " ");

describe("NZ display formatters", () => {
  it("formats a daily bar timestamp as its own date", () => {
    expect(norm(formatNzDate(Date.UTC(2026, 10, 24) / 1000))).toBe("24 Nov 2026");
  });
  it("formats date and time in Pacific/Auckland", () => {
    expect(norm(formatNzDateTime(Date.parse("2026-11-24T20:00:00Z") / 1000))).toBe("25 Nov 2026, 09:00");
  });
  it("labels tick marks by type", () => {
    const t = Date.parse("2026-11-24T20:00:00Z") / 1000; // 25 Nov 09:00 NZDT
    expect(nzTickMarkLabel(t, 0)).toBe("2026");
    expect(nzTickMarkLabel(t, 1)).toBe("Nov");
    expect(nzTickMarkLabel(t, 2)).toBe("25");
    expect(nzTickMarkLabel(t, 3)).toBe("09:00");
    expect(nzTickMarkLabel(t, 4)).toBe("09:00");
  });
});
