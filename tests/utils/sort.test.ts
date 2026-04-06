import { sortItems, SortSpec } from "src/utils/sort";
import { ChecklistItem } from "src/models/types";

const item = (
    name: string,
    completed = false,
    properties: Record<string, string | number | boolean> = {}
): ChecklistItem => ({
    filePath: `${name}.md`,
    name,
    description: "",
    properties,
    completed,
});

describe("sortItems", () => {
    const items: ChecklistItem[] = [
        item("Banana", false, { priority: 2 }),
        item("apple", true, { priority: 1 }),
        item("cherry", false, { priority: 3 }),
    ];

    test("sorts by name ascending case-insensitive", () => {
        const sorted = sortItems(items, { key: "name", dir: "asc" });
        expect(sorted.map((i) => i.name)).toEqual(["apple", "Banana", "cherry"]);
    });

    test("sorts by name descending", () => {
        const sorted = sortItems(items, { key: "name", dir: "desc" });
        expect(sorted.map((i) => i.name)).toEqual(["cherry", "Banana", "apple"]);
    });

    test("sorts by completed (incomplete first when asc)", () => {
        const sorted = sortItems(items, { key: "completed", dir: "asc" });
        expect(sorted[sorted.length - 1].completed).toBe(true);
    });

    test("sorts by a numeric property", () => {
        const sorted = sortItems(items, { key: "priority", dir: "desc" });
        expect(sorted.map((i) => i.name)).toEqual(["cherry", "Banana", "apple"]);
    });

    test("missing values sort last regardless of direction", () => {
        const withMissing = [...items, item("zeta")];
        const asc = sortItems(withMissing, { key: "priority", dir: "asc" });
        expect(asc[asc.length - 1].name).toBe("zeta");
        const desc = sortItems(withMissing, { key: "priority", dir: "desc" });
        expect(desc[desc.length - 1].name).toBe("zeta");
    });

    test("does not mutate input", () => {
        const copy = [...items];
        sortItems(items, { key: "name", dir: "asc" });
        expect(items).toEqual(copy);
    });

    test("unknown key returns input order (stable)", () => {
        const spec: SortSpec = { key: "nope", dir: "asc" };
        expect(sortItems(items, spec).map((i) => i.name)).toEqual(
            items.map((i) => i.name)
        );
    });
});
