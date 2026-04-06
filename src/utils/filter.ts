import { ChecklistItem } from "src/models/types";

export type StatusFilter = "all" | "active" | "done";

export interface FilterSpec {
    query?: string;
    status?: StatusFilter;
    properties?: Record<string, string | number | boolean | Array<string | number | boolean>>;
}

function matchesQuery(item: ChecklistItem, query: string): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    if (item.name.toLowerCase().includes(q)) return true;
    if (item.description.toLowerCase().includes(q)) return true;
    for (const value of Object.values(item.properties)) {
        if (String(value).toLowerCase().includes(q)) return true;
    }
    return false;
}

function matchesStatus(item: ChecklistItem, status: StatusFilter | undefined): boolean {
    if (!status || status === "all") return true;
    return status === "done" ? item.completed : !item.completed;
}

function matchesProperties(
    item: ChecklistItem,
    props: FilterSpec["properties"]
): boolean {
    if (!props) return true;
    for (const [key, expected] of Object.entries(props)) {
        const actual = item.properties[key];
        if (Array.isArray(expected)) {
            if (expected.length === 0) continue;
            if (!expected.some((v) => v === actual)) return false;
        } else {
            if (actual !== expected) return false;
        }
    }
    return true;
}

export function filterItems(items: ChecklistItem[], spec: FilterSpec): ChecklistItem[] {
    return items.filter(
        (item) =>
            matchesQuery(item, spec.query ?? "") &&
            matchesStatus(item, spec.status) &&
            matchesProperties(item, spec.properties)
    );
}
