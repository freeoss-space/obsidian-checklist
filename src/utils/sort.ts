import { ChecklistItem } from "src/models/types";

export type SortDir = "asc" | "desc";

export interface SortSpec {
    key: string;
    dir: SortDir;
}

const BUILTIN_KEYS = new Set(["name", "completed", "filePath", "description"]);

function getValue(item: ChecklistItem, key: string): unknown {
    if (BUILTIN_KEYS.has(key)) {
        return (item as unknown as Record<string, unknown>)[key];
    }
    if (key in item.properties) return item.properties[key];
    return undefined;
}

function compare(a: unknown, b: unknown): number {
    if (typeof a === "number" && typeof b === "number") return a - b;
    if (typeof a === "boolean" && typeof b === "boolean") {
        return a === b ? 0 : a ? 1 : -1;
    }
    return String(a).localeCompare(String(b), undefined, { sensitivity: "base" });
}

export function sortItems(items: ChecklistItem[], spec: SortSpec): ChecklistItem[] {
    const indexed = items.map((item, index) => ({ item, index }));
    const knownKey =
        BUILTIN_KEYS.has(spec.key) ||
        items.some((i) => Object.prototype.hasOwnProperty.call(i.properties, spec.key));
    if (!knownKey) return items.slice();

    indexed.sort((a, b) => {
        const av = getValue(a.item, spec.key);
        const bv = getValue(b.item, spec.key);
        const aMissing = av === undefined || av === null || av === "";
        const bMissing = bv === undefined || bv === null || bv === "";
        if (aMissing && bMissing) return a.index - b.index;
        if (aMissing) return 1;
        if (bMissing) return -1;
        const cmp = compare(av, bv);
        if (cmp !== 0) return spec.dir === "desc" ? -cmp : cmp;
        return a.index - b.index;
    });

    return indexed.map((entry) => entry.item);
}
