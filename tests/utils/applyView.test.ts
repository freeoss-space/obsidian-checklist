import { applyView, ViewState } from "src/utils/applyView";
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

const items: ChecklistItem[] = [
    item("Banana", false, { tag: "fruit", priority: 2 }),
    item("apple", true, { tag: "fruit", priority: 1 }),
    item("carrot", false, { tag: "veg", priority: 3 }),
];

describe("applyView", () => {
    test("default state returns all items in original order", () => {
        const state: ViewState = {};
        expect(applyView(items, state).map((i) => i.name)).toEqual([
            "Banana",
            "apple",
            "carrot",
        ]);
    });

    test("filter then sort", () => {
        const state: ViewState = {
            filter: { properties: { tag: "fruit" } },
            sort: { key: "name", dir: "asc" },
        };
        expect(applyView(items, state).map((i) => i.name)).toEqual(["apple", "Banana"]);
    });

    test("status active + sort by priority desc", () => {
        const state: ViewState = {
            filter: { status: "active" },
            sort: { key: "priority", dir: "desc" },
        };
        expect(applyView(items, state).map((i) => i.name)).toEqual(["carrot", "Banana"]);
    });

    test("query narrows results", () => {
        const state: ViewState = { filter: { query: "car" } };
        expect(applyView(items, state).map((i) => i.name)).toEqual(["carrot"]);
    });
});
