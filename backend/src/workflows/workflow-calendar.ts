export type WorkflowCalendarConfig = {
  timezone?: string;
  workingDays?: unknown;
  workStart?: unknown;
  workEnd?: unknown;
  holidays?: unknown;
};

type LocalParts = { year: number; month: number; day: number; hour: number; minute: number; weekday: number };

const DEFAULT_DAYS = [1, 2, 3, 4, 5];
const DEFAULT_START = 9 * 60;
const DEFAULT_END = 17 * 60;

function timezone(config?: WorkflowCalendarConfig) {
  const tz = typeof config?.timezone === 'string' && config.timezone.trim() ? config.timezone.trim() : 'UTC';
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(); return tz; } catch { return 'UTC'; }
}

function minutesOf(value: unknown, fallback: number) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value ?? ''));
  return match ? Number(match[1]) * 60 + Number(match[2]) : fallback;
}

function localParts(date: Date, tz: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekdayMap: Record<string, number> = { Sun: 7, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { year: Number(get('year')), month: Number(get('month')), day: Number(get('day')), hour: Number(get('hour')), minute: Number(get('minute')), weekday: weekdayMap[get('weekday')] ?? 1 };
}

function offsetMinutes(date: Date, tz: string) {
  const p = localParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return Math.round((asUtc - date.getTime()) / 60000);
}

function fromLocal(parts: Omit<LocalParts, 'weekday'>, tz: string) {
  let candidate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute));
  // Two passes cover normal zones and DST transitions without introducing a dependency.
  for (let i = 0; i < 3; i += 1) candidate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - offsetMinutes(candidate, tz) * 60000);
  return candidate;
}

function addLocalDays(parts: LocalParts, days: number): LocalParts {
  const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, parts.hour, parts.minute));
  return { ...parts, year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), weekday: d.getUTCDay() === 0 ? 7 : d.getUTCDay() };
}

function normalizedConfig(config?: WorkflowCalendarConfig) {
  const days = Array.isArray(config?.workingDays) ? config!.workingDays.map(Number).filter((n) => n >= 1 && n <= 7) : DEFAULT_DAYS;
  const start = minutesOf(config?.workStart, DEFAULT_START);
  const end = minutesOf(config?.workEnd, DEFAULT_END);
  const holidays = new Set(Array.isArray(config?.holidays) ? config!.holidays.map(String) : []);
  return { tz: timezone(config), days: [...new Set(days)], start: Math.min(start, end), end: Math.max(start, end), holidays };
}

/** Add business minutes using the workflow's configured timezone, not the server timezone. */
export function addWorkflowBusinessMinutes(start: Date, minutes: number, config?: WorkflowCalendarConfig) {
  const total = Math.max(0, Math.floor(Number(minutes) || 0));
  if (total === 0) return new Date(start);
  const { tz, days, start: workStart, end: workEnd, holidays } = normalizedConfig(config);
  let cursor = localParts(start, tz);
  let remaining = total;

  for (let guard = 0; guard < 3660 && remaining > 0; guard += 1) {
    const dateKey = `${String(cursor.year).padStart(4, '0')}-${String(cursor.month).padStart(2, '0')}-${String(cursor.day).padStart(2, '0')}`;
    const currentMinutes = cursor.hour * 60 + cursor.minute;
    if (days.includes(cursor.weekday) && !holidays.has(dateKey) && workEnd > workStart) {
      if (currentMinutes < workStart) cursor = { ...cursor, hour: Math.floor(workStart / 60), minute: workStart % 60 };
      const at = cursor.hour * 60 + cursor.minute;
      if (at < workEnd) {
        const available = Math.min(remaining, workEnd - at);
        const target = at + available;
        cursor = { ...cursor, hour: Math.floor(target / 60), minute: target % 60 };
        remaining -= available;
        if (remaining === 0) return fromLocal(cursor, tz);
      }
    }
    cursor = addLocalDays({ ...cursor, hour: 0, minute: 0 }, 1);
  }
  return fromLocal(cursor, tz);
}
