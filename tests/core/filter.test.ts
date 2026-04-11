import { filterItems } from "src/core/filter";
import type { ChecklistItem } from "src/core/types";

const item = (name: string, opts: Partial<ChecklistItem> = {}): ChecklistItem => ({
    path: `${name}.md`,
    name,
    completed: false,
    properties: {},
    createdAt: 0,
    mtime: 0,
    ...opts,
});

describe("filterItems - query", () => {
    it("returns everything when query empty", () => {
        const items = [item("a"), item("b")];
        expect(filterItems(items, { query: "", status: "all" }).map((i) => i.name)).toEqual(["a", "b"]);
    });

    it("matches name case-insensitively", () => {
        const items = [item("Apple"), item("Banana"), item("cherry")];
        expect(filterItems(items, { query: "aN", status: "all" }).map((i) => i.name)).toEqual(["Banana"]);
    });

    it("matches description", () => {
        const items = [item("a", { description: "buy milk" }), item("b", { description: "read book" })];
        expect(filterItems(items, { query: "milk", status: "all" }).map((i) => i.name)).toEqual(["a"]);
    });

    it("matches property values", () => {
        const items = [item("a", { properties: { tag: "urgent" } }), item("b", { properties: { tag: "later" } })];
        expect(filterItems(items, { query: "urgen", status: "all" }).map((i) => i.name)).toEqual(["a"]);
    });

    it("does not crash on null property values", () => {
        const items = [item("a", { properties: { x: null } })];
        expect(() => filterItems(items, { query: "z", status: "all" })).not.toThrow();
    });
});

describe("filterItems - status", () => {
    const items = [item("a", { completed: true }), item("b"), item("c", { completed: true })];
    it("all", () => {
        expect(filterItems(items, { query: "", status: "all" }).length).toBe(3);
    });
    it("active", () => {
        expect(filterItems(items, { query: "", status: "active" }).map((i) => i.name)).toEqual(["b"]);
    });
    it("done", () => {
        expect(filterItems(items, { query: "", status: "done" }).map((i) => i.name)).toEqual(["a", "c"]);
    });
});

describe("filterItems - property chips", () => {
    const items = [
        item("a", { properties: { prio: "high", tag: "work" } }),
        item("b", { properties: { prio: "low", tag: "work" } }),
        item("c", { properties: { prio: "high", tag: "home" } }),
    ];

    it("equality filter on single property", () => {
        expect(
            filterItems(items, { query: "", status: "all", properties: { prio: ["high"] } }).map((i) => i.name)
        ).toEqual(["a", "c"]);
    });

    it("multi-value filter is OR", () => {
        expect(
            filterItems(items, { query: "", status: "all", properties: { prio: ["high", "low"] } }).map((i) => i.name)
        ).toEqual(["a", "b", "c"]);
    });

    it("multiple property filters combine with AND", () => {
        expect(
            filterItems(items, {
                query: "",
                status: "all",
                properties: { prio: ["high"], tag: ["work"] },
            }).map((i) => i.name)
        ).toEqual(["a"]);
    });

    it("empty value array is ignored (not empty result)", () => {
        expect(
            filterItems(items, { query: "", status: "all", properties: { prio: [] } }).length
        ).toBe(3);
    });

    it("query + status + props compose with AND", () => {
        const it2 = [
            item("apple", { completed: false, properties: { tag: "fruit" } }),
            item("banana", { completed: true, properties: { tag: "fruit" } }),
            item("chair", { completed: false, properties: { tag: "furniture" } }),
        ];
        const out = filterItems(it2, {
            query: "a",
            status: "active",
            properties: { tag: ["fruit"] },
        });
        expect(out.map((i) => i.name)).toEqual(["apple"]);
    });
});
