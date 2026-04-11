import type { ChecklistItem, ItemGroup } from "./types";

const EMPTY_LABEL = "—";

function labelFor(item: ChecklistItem, key: string): string {
    if (key === "completed") return item.completed ? "Completed" : "Active";
    const v = item.properties[key];
    if (v === null || v === undefined || v === "") return EMPTY_LABEL;
    if (Array.isArray(v)) return v.length === 0 ? EMPTY_LABEL : v.map(String).join(", ");
    return String(v);
}

/**
 * Partition items into groups by `key`.
 *
 * - `key === null` returns a single group with all items.
 * - Group labels are sorted alphabetically; the empty bucket ("—")
 *   always sorts last.
 * - Within a group, item order is preserved from the input.
 * - Pure / non-mutating.
 */
export function groupItems(items: ChecklistItem[], key: string | null): ItemGroup[] {
    if (key === null) {
        return [{ label: "", items: items.slice(), count: items.length }];
    }
    const buckets = new Map<string, ChecklistItem[]>();
    for (const item of items) {
        const label = labelFor(item, key);
        const existing = buckets.get(label);
        if (existing) existing.push(item);
        else buckets.set(label, [item]);
    }
    const labels = Array.from(buckets.keys()).sort((a, b) => {
        if (a === EMPTY_LABEL) return 1;
        if (b === EMPTY_LABEL) return -1;
        return a.localeCompare(b);
    });
    return labels.map((label) => {
        const arr = buckets.get(label)!;
        return { label, items: arr, count: arr.length };
    });
}
