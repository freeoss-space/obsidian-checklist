import type { ChecklistItem, FilterOptions } from "./types";

/** Lowercased stringify — null/undefined become "". */
function toHaystack(v: unknown): string {
    if (v === null || v === undefined) return "";
    if (Array.isArray(v)) return v.map(toHaystack).join(" ");
    return String(v).toLocaleLowerCase();
}

/** Case-insensitive substring search across name, description, and property values. */
function matchesQuery(item: ChecklistItem, q: string): boolean {
    if (q === "") return true;
    const needle = q.toLocaleLowerCase();
    if (toHaystack(item.name).includes(needle)) return true;
    if (toHaystack(item.description).includes(needle)) return true;
    for (const k of Object.keys(item.properties)) {
        if (toHaystack(item.properties[k]).includes(needle)) return true;
    }
    return false;
}

function matchesStatus(item: ChecklistItem, status: FilterOptions["status"]): boolean {
    if (status === "all") return true;
    if (status === "active") return !item.completed;
    return item.completed;
}

/** True if `item.properties[key]` equals, or contains, any of `allowed`. */
function propertyAllows(item: ChecklistItem, key: string, allowed: unknown[]): boolean {
    if (allowed.length === 0) return true; // no constraint
    const v = item.properties[key];
    if (v === null || v === undefined) return false;
    if (Array.isArray(v)) {
        return v.some((iv) => allowed.some((a) => a === iv));
    }
    return allowed.some((a) => a === v);
}

/**
 * Filter items.
 *
 * - `query` is a case-insensitive substring match over name, description,
 *   and all property values.
 * - `status` is `all | active | done`.
 * - `properties` is per-property OR over allowed values; properties
 *   combine with AND.
 * - All criteria compose with AND.
 * - Pure / non-mutating.
 */
export function filterItems(items: ChecklistItem[], opts: FilterOptions): ChecklistItem[] {
    const { query, status, properties } = opts;
    const propKeys = properties ? Object.keys(properties) : [];
    return items.filter((item) => {
        if (!matchesQuery(item, query)) return false;
        if (!matchesStatus(item, status)) return false;
        for (const k of propKeys) {
            if (!propertyAllows(item, k, properties![k])) return false;
        }
        return true;
    });
}
