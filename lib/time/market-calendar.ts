export const MARKET_TIME_ZONE = "America/New_York";
export const DAILY_CLOSE_CUTOFF = { hour: 18, minute: 0 } as const;

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 0 = Sunday ... 6 = Saturday */
  weekday: number;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: WEEKDAYS.indexOf(get("weekday")),
  };
}

function offsetMs(t: number, timeZone: string): number {
  const p = zonedParts(new Date(t), timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(t / 60000) * 60000;
}

/** Converts a wall-clock time in `timeZone` on `date` (YYYY-MM-DD) to a UTC instant. */
export function zonedDateTimeToUtc(date: string, hour: number, minute: number, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, hour, minute);
  const off1 = offsetMs(guess, timeZone);
  let result = guess - off1;
  const off2 = offsetMs(result, timeZone);
  if (off2 !== off1) result = guess - off2;
  return new Date(result);
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** 0 = Sunday ... 6 = Saturday */
export function dayOfWeek(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** Date (YYYY-MM-DD, US exchange-local) of the latest daily bar that should be complete at `now`. */
export function expectedLatestDailyCandleDate(now: Date): string {
  const p = zonedParts(now, MARKET_TIME_ZONE);
  let d = `${p.year}-${pad(p.month)}-${pad(p.day)}`;
  const beforeCutoff =
    p.hour < DAILY_CLOSE_CUTOFF.hour || (p.hour === DAILY_CLOSE_CUTOFF.hour && p.minute < DAILY_CLOSE_CUTOFF.minute);
  if (beforeCutoff) d = addDays(d, -1);
  while (dayOfWeek(d) === 0 || dayOfWeek(d) === 6) d = addDays(d, -1);
  return d;
}

export function dailyCutoffInstant(date: string): Date {
  return zonedDateTimeToUtc(date, DAILY_CLOSE_CUTOFF.hour, DAILY_CLOSE_CUTOFF.minute, MARKET_TIME_ZONE);
}

export function isDailyCacheFresh(args: {
  latestCachedTs: string | null;
  lastOkFetchAt: Date | null;
  now: Date;
}): boolean {
  if (args.latestCachedTs === null) return false;
  const expected = expectedLatestDailyCandleDate(args.now);
  if (dailyTsToDate(args.latestCachedTs) >= expected) return true;
  return args.lastOkFetchAt !== null && args.lastOkFetchAt.getTime() >= dailyCutoffInstant(expected).getTime();
}

export function dateToDailyTs(date: string): string {
  return `${date}T00:00:00.000Z`;
}

export function dailyTsToDate(ts: string): string {
  return new Date(ts).toISOString().slice(0, 10);
}
