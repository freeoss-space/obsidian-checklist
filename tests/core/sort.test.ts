import { sortItems } from "src/core/sort";
import type { ChecklistItem } from "src/core/types";

const make = (name: string, props: Record<string, unknown> = {}): ChecklistItem => ({
    path: `${name}.md`,
    name,
    completed: false,
    properties: props,
    createdAt: 0,
    mtime: 0,
});

describe("sortItems", () => {
    it("sorts by name ascending by default and is non-mutating", () => {
        const items = [make("banana"), make("apple"), make("Cherry")];
        const out = sortItems(items, { key: "name", dir: "asc" });
        expect(out.map((i) => i.name)).toEqual(["apple", "banana", "Cherry"]);
        // original unchanged
        expect(items.map((i) => i.name)).toEqual(["banana", "apple", "Cherry"]);
    });

    it("descending flips order", () => {
        const items = [make("a"), make("c"), make("b")];
        expect(sortItems(items, { key: "name", dir: "desc" }).map((i) => i.name)).toEqual(["c", "b", "a"]);
    });

    it("sorts by completed flag (active first)", () => {
        const items = [
            { ...make("a"), completed: true },
            make("b"),
            { ...make("c"), completed: true },
            make("d"),
        ];
        const out = sortItems(items, { key: "completed", dir: "asc" });
        expect(out.map((i) => i.completed)).toEqual([false, false, true, true]);
    });

    it("sorts by numeric property correctly", () => {
        const items = [make("a", { n: 10 }), make("b", { n: 2 }), make("c", { n: 7 })];
        expect(sortItems(items, { key: "n", dir: "asc" }).map((i) => i.name)).toEqual(["b", "c", "a"]);
    });

    it("sinks missing values to the end regardless of direction", () => {
        const items = [make("a", { n: 3 }), make("b"), make("c", { n: 1 })];
        expect(sortItems(items, { key: "n", dir: "asc" }).map((i) => i.name)).toEqual(["c", "a", "b"]);
        expect(sortItems(items, { key: "n", dir: "desc" }).map((i) => i.name)).toEqual(["a", "c", "b"]);
    });

    it("is stable for equal keys", () => {
        const items = [make("a", { p: 1 }), make("b", { p: 1 }), make("c", { p: 1 })];
        expect(sortItems(items, { key: "p", dir: "asc" }).map((i) => i.name)).toEqual(["a", "b", "c"]);
    });

    it("sorts date strings chronologically", () => {
        const items = [
            make("a", { due: "2025-01-10" }),
            make("b", { due: "2024-12-01" }),
            make("c", { due: "2025-02-03" }),
        ];
        expect(sortItems(items, { key: "due", dir: "asc" }).map((i) => i.name)).toEqual(["b", "a", "c"]);
    });

    it("compares strings case-insensitively", () => {
        const items = [make("Banana"), make("apple"), make("cherry")];
        expect(sortItems(items, { key: "name", dir: "asc" }).map((i) => i.name)).toEqual([
            "apple",
            "Banana",
            "cherry",
        ]);
    });
});
