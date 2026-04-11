import type { ChecklistItem, SortOptions } from "./types";

/**
 * Extract the sort key value for a given item.
 *
 * Built-in keys:
 *  - `name`        basename of the file
 *  - `completed`   boolean
 *  - `createdAt`   ms since epoch
 *  - `mtime`       ms since epoch
 *
 * Any other key looks up the matching property in `item.properties`.
 */
function valueFor(item: ChecklistItem, key: string): unknown {
    switch (key) {
        case "name":
            return item.name;
        case "completed":
            return item.completed;
        case "createdAt":
            return item.createdAt;
        case "mtime":
            return item.mtime;
        default:
            return item.properties[key];
    }
}

/** Missing/empty values always sink, regardless of direction. */
function isMissing(v: unknown): boolean {
    if (v === null || v === undefined) return true;
    if (typeof v === "string" && v === "") return true;
    if (typeof v === "number" && !Number.isFinite(v)) return true;
    return false;
}

/** Return a cross-type comparable form. */
function coerce(v: unknown): string | number | boolean {
    if (typeof v === "number" || typeof v === "boolean") return v;
    if (v instanceof Date) return v.getTime();
    return String(v).toLocaleLowerCase();
}

function compare(a: unknown, b: unknown): number {
    const ca = coerce(a);
    const cb = coerce(b);
    if (typeof ca === "number" && typeof cb === "number") {
        return ca === cb ? 0 : ca < cb ? -1 : 1;
    }
    if (typeof ca === "boolean" && typeof cb === "boolean") {
        // Active (false) before completed (true).
        return ca === cb ? 0 : ca ? 1 : -1;
    }
    const sa = String(ca);
    const sb = String(cb);
    if (sa === sb) return 0;
    return sa < sb ? -1 : 1;
}

/**
 * Sort items by a key.
 *
 * - Pure / non-mutating — returns a new array.
 * - Stable — equal elements preserve their input order.
 * - Missing values always sink to the bottom regardless of direction.
 */
export function sortItems(items: ChecklistItem[], opts: SortOptions): ChecklistItem[] {
    const indexed = items.map((item, index) => ({ item, index }));
    const factor = opts.dir === "desc" ? -1 : 1;
    indexed.sort((x, y) => {
        const va = valueFor(x.item, opts.key);
        const vb = valueFor(y.item, opts.key);
        const ma = isMissing(va);
        const mb = isMissing(vb);
        if (ma && mb) return x.index - y.index;
        if (ma) return 1; // sink
        if (mb) return -1; // sink
        const c = compare(va, vb);
        if (c !== 0) return c * factor;
        return x.index - y.index;
    });
    return indexed.map((e) => e.item);
}
