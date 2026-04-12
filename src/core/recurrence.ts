/**
 * Tiny recurrence engine.
 *
 * Supported patterns: `Nd` (days), `Nw` (weeks), `Nm` (months).
 * Anything else returns `null`. All computation is UTC so DST does not
 * shift the date of a purely-calendar reminder.
 */

const PATTERN = /^(\d+)([dwm])$/;

function parseIsoUtc(s: string): Date | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const [y, m, d] = s.split("-").map((p) => Number(p));
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (
        dt.getUTCFullYear() !== y ||
        dt.getUTCMonth() !== m - 1 ||
        dt.getUTCDate() !== d
    ) {
        return null;
    }
    return dt;
}

function toIso(dt: Date): string {
    const y = dt.getUTCFullYear();
    const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const d = String(dt.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

export function nextOccurrence(dateIso: string, pattern: string): string | null {
    const dt = parseIsoUtc(dateIso);
    if (!dt) return null;
    const m = PATTERN.exec(pattern);
    if (!m) return null;
    const n = Number(m[1]);
    const unit = m[2];
    if (!Number.isSafeInteger(n) || n <= 0 || n > 1000) return null;
    if (unit === "d") {
        dt.setUTCDate(dt.getUTCDate() + n);
    } else if (unit === "w") {
        dt.setUTCDate(dt.getUTCDate() + n * 7);
    } else {
        // Month arithmetic that clamps to the last valid day of the target month.
        const day = dt.getUTCDate();
        dt.setUTCDate(1);
        dt.setUTCMonth(dt.getUTCMonth() + n);
        const lastDay = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
        dt.setUTCDate(Math.min(day, lastDay));
    }
    return toIso(dt);
}
