import { filterItems, FilterSpec } from "src/utils/filter";
import { ChecklistItem } from "src/models/types";

const item = (
    name: string,
    description = "",
    completed = false,
    properties: Record<string, string | number | boolean> = {}
): ChecklistItem => ({
    filePath: `${name}.md`,
    name,
    description,
    properties,
    completed,
});

const items: ChecklistItem[] = [
    item("Read book", "great novel", false, { tag: "fiction", rating: 4 }),
    item("Buy milk", "from store", true, { tag: "errand", rating: 1 }),
    item("Write essay", "deep work", false, { tag: "work", rating: 5 }),
];

describe("filterItems", () => {
    test("empty spec returns all items", () => {
        expect(filterItems(items, {})).toHaveLength(3);
    });

    test("query matches name (case-insensitive)", () => {
        expect(filterItems(items, { query: "READ" }).map((i) => i.name)).toEqual([
            "Read book",
        ]);
    });

    test("query matches description", () => {
        expect(filterItems(items, { query: "novel" }).map((i) => i.name)).toEqual([
            "Read book",
        ]);
    });

    test("query matches property values", () => {
        expect(filterItems(items, { query: "work" }).map((i) => i.name)).toEqual([
            "Write essay",
        ]);
    });

    test("status active excludes completed", () => {
        const out = filterItems(items, { status: "active" });
        expect(out.every((i) => !i.completed)).toBe(true);
        expect(out).toHaveLength(2);
    });

    test("status done returns only completed", () => {
        const out = filterItems(items, { status: "done" });
        expect(out).toHaveLength(1);
        expect(out[0].name).toBe("Buy milk");
    });

    test("property equality filter", () => {
        const spec: FilterSpec = { properties: { tag: "fiction" } };
        expect(filterItems(items, spec).map((i) => i.name)).toEqual(["Read book"]);
    });

    test("property multi-value (OR) filter", () => {
        const spec: FilterSpec = { properties: { tag: ["fiction", "work"] } };
        expect(filterItems(items, spec).map((i) => i.name)).toEqual([
            "Read book",
            "Write essay",
        ]);
    });

    test("filters compose (AND across criteria)", () => {
        const spec: FilterSpec = {
            query: "e",
            status: "active",
            properties: { tag: "work" },
        };
        expect(filterItems(items, spec).map((i) => i.name)).toEqual(["Write essay"]);
    });
});
