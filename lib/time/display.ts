export const DISPLAY_TIME_ZONE = "Pacific/Auckland";
export const DISPLAY_LOCALE = "en-NZ";

const dateFormat = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
  timeZone: DISPLAY_TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
});
const dateTimeFormat = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
  timeZone: DISPLAY_TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const yearFormat = new Intl.DateTimeFormat(DISPLAY_LOCALE, { timeZone: DISPLAY_TIME_ZONE, year: "numeric" });
const monthFormat = new Intl.DateTimeFormat(DISPLAY_LOCALE, { timeZone: DISPLAY_TIME_ZONE, month: "short" });
const dayFormat = new Intl.DateTimeFormat(DISPLAY_LOCALE, { timeZone: DISPLAY_TIME_ZONE, day: "numeric" });
const timeFormat = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
  timeZone: DISPLAY_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const toDate = (utcSeconds: number): Date => new Date(utcSeconds * 1000);

export function formatNzDate(utcSeconds: number): string {
  return dateFormat.format(toDate(utcSeconds));
}

export function formatNzDateTime(utcSeconds: number): string {
  return dateTimeFormat.format(toDate(utcSeconds));
}

/** Tick types match lightweight-charts TickMarkType: Year 0, Month 1, DayOfMonth 2, Time 3, TimeWithSeconds 4. */
export function nzTickMarkLabel(utcSeconds: number, tickMarkType: 0 | 1 | 2 | 3 | 4): string {
  const d = toDate(utcSeconds);
  switch (tickMarkType) {
    case 0:
      return yearFormat.format(d);
    case 1:
      return monthFormat.format(d);
    case 2:
      return dayFormat.format(d);
    default:
      return timeFormat.format(d);
  }
}
