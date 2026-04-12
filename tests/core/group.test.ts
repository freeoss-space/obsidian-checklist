import { groupItems } from "src/core/group";
import type { ChecklistItem } from "src/core/types";

const mk = (name: string, opts: Partial<ChecklistItem> = {}): ChecklistItem => ({
    path: `${name}.md`,
    name,
    completed: false,
    properties: {},
    createdAt: 0,
    mtime: 0,
    ...opts,
});

describe("groupItems", () => {
    it("returns a single group when key is null/none", () => {
        const items = [mk("a"), mk("b")];
        const out = groupItems(items, null);
        expect(out).toHaveLength(1);
        expect(out[0].items.map((i) => i.name)).toEqual(["a", "b"]);
    });

    it("groups by completion state", () => {
        const items = [mk("a", { completed: true }), mk("b"), mk("c", { completed: true })];
        const out = groupItems(items, "completed");
        const labels = out.map((g) => g.label).sort();
        expect(labels).toEqual(["Active", "Completed"]);
        const active = out.find((g) => g.label === "Active")!;
        expect(active.items.map((i) => i.name)).toEqual(["b"]);
        expect(active.count).toBe(1);
    });

    it("groups by arbitrary property", () => {
        const items = [
            mk("a", { properties: { prio: "high" } }),
            mk("b", { properties: { prio: "low" } }),
            mk("c", { properties: { prio: "high" } }),
            mk("d"),
        ];
        const out = groupItems(items, "prio");
        const high = out.find((g) => g.label === "high")!;
        expect(high.items.map((i) => i.name)).toEqual(["a", "c"]);
        expect(out.find((g) => g.label === "low")!.items.map((i) => i.name)).toEqual(["b"]);
        // missing values go in the "—" or empty bucket
        const empty = out.find((g) => g.label === "—")!;
        expect(empty.items.map((i) => i.name)).toEqual(["d"]);
    });

    it("sorts groups alphabetically with empty bucket last", () => {
        const items = [
            mk("1", { properties: { k: "beta" } }),
            mk("2", { properties: { k: "alpha" } }),
            mk("3"),
            mk("4", { properties: { k: "gamma" } }),
        ];
        const out = groupItems(items, "k");
        expect(out.map((g) => g.label)).toEqual(["alpha", "beta", "gamma", "—"]);
    });

    it("each group has correct count", () => {
        const items = [mk("a", { properties: { k: "x" } }), mk("b", { properties: { k: "x" } })];
        const out = groupItems(items, "k");
        expect(out[0].count).toBe(2);
    });
});
