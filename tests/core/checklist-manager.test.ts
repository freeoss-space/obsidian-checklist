import { App, TFile } from "obsidian";
import { ChecklistManager } from "src/core/checklist-manager";
import type { ChecklistDefinition } from "src/core/types";

const defBase: ChecklistDefinition = {
    id: "reading",
    name: "Reading",
    kind: "checklist",
    folder: "Reading",
    properties: [
        { key: "author", type: "text" },
        { key: "pages", type: "number" },
    ],
};

describe("ChecklistManager", () => {
    let app: App;
    let mgr: ChecklistManager;

    beforeEach(() => {
        app = new App();
        mgr = new ChecklistManager(app);
    });

    it("scans a folder and loads items from .md files", async () => {
        await app.vault.create("Reading/Book One.md", `---\ncompleted: false\nauthor: Alice\npages: 100\n---\nbody`);
        await app.vault.create("Reading/Book Two.md", `---\ncompleted: true\nauthor: Bob\npages: 300\n---\n`);
        await app.vault.create("Other/Ignore.md", `---\n---\n`);

        const items = await mgr.loadItems(defBase);
        const names = items.map((i) => i.name).sort();
        expect(names).toEqual(["Book One", "Book Two"]);
        const one = items.find((i) => i.name === "Book One")!;
        expect(one.completed).toBe(false);
        expect(one.properties.author).toBe("Alice");
        expect(one.properties.pages).toBe(100);
    });

    it("creates a new item with given properties (checklist)", async () => {
        const file = await mgr.createItem(defBase, "Gatsby", { author: "FSF", pages: 180 });
        expect(file).toBeInstanceOf(TFile);
        expect(file.path).toBe("Reading/Gatsby.md");
        const content = await app.vault.read(file);
        expect(content).toMatch(/completed: false/);
        expect(content).toMatch(/author: FSF/);
        expect(content).toMatch(/pages: 180/);
    });

    it("refuses to create items outside the configured folder (path traversal)", async () => {
        await expect(mgr.createItem(defBase, "../../etc/passwd", {})).rejects.toThrow();
    });

    it.each([
        "../escape",
        "a/b",
        "a\\b",
        "",
        ".",
        "..",
        "con:name",
        "has\u0000null",
    ])("rejects unsafe name %p", async (name) => {
        await expect(mgr.createItem(defBase, name, {})).rejects.toThrow();
    });

    it("refuses duplicate item names in the same checklist", async () => {
        await mgr.createItem(defBase, "Dup", {});
        await expect(mgr.createItem(defBase, "Dup", {})).rejects.toThrow();
    });

    it("toggles completion and persists to front matter", async () => {
        const file = await mgr.createItem(defBase, "Toggle Me", {});
        await mgr.toggleItem(defBase, file.path);
        let content = await app.vault.read(file);
        expect(content).toMatch(/completed: true/);
        await mgr.toggleItem(defBase, file.path);
        content = await app.vault.read(file);
        expect(content).toMatch(/completed: false/);
    });

    it("updates an arbitrary property without losing others", async () => {
        const file = await mgr.createItem(defBase, "Upd", { author: "A", pages: 10 });
        await mgr.updateItemProperty(defBase, file.path, "pages", 42);
        const content = await app.vault.read(file);
        expect(content).toMatch(/author: A/);
        expect(content).toMatch(/pages: 42/);
    });

    it("deletes an item by path", async () => {
        const file = await mgr.createItem(defBase, "Del", {});
        await mgr.deleteItem(defBase, file.path);
        expect(app.vault.getAbstractFileByPath(file.path)).toBeNull();
    });

    describe("kind: list (bullet lists)", () => {
        const listDef: ChecklistDefinition = { ...defBase, id: "groceries", name: "Groceries", kind: "list", folder: "Groceries", properties: [] };

        it("omits completed field when creating", async () => {
            const file = await mgr.createItem(listDef, "Milk", {});
            const content = await app.vault.read(file);
            expect(content).not.toMatch(/completed:/);
        });

        it("loaded list items are never completed", async () => {
            await app.vault.create("Groceries/Eggs.md", `---\n---\n`);
            const items = await mgr.loadItems(listDef);
            expect(items[0].completed).toBe(false);
        });
    });

    describe("incremental indexing", () => {
        it("creating a file in the folder adds an item to the cache", async () => {
            await mgr.loadItems(defBase);
            const file = await app.vault.create("Reading/New.md", `---\n---\n`);
            mgr.onFileEvent("create", file, defBase);
            const items = mgr.getCachedItems(defBase);
            expect(items.map((i) => i.name)).toContain("New");
        });

        it("deleting a file removes it from the cache", async () => {
            const file = await app.vault.create("Reading/Gone.md", `---\n---\n`);
            await mgr.loadItems(defBase);
            mgr.onFileEvent("delete", file, defBase);
            const items = mgr.getCachedItems(defBase);
            expect(items.map((i) => i.name)).not.toContain("Gone");
        });

        it("ignores files outside the configured folder", async () => {
            await mgr.loadItems(defBase);
            const file = await app.vault.create("Other/ignored.md", `---\n---\n`);
            mgr.onFileEvent("create", file, defBase);
            const items = mgr.getCachedItems(defBase);
            expect(items.map((i) => i.name)).not.toContain("ignored");
        });
    });

    describe("discoverChecklists", () => {
        it("discovers folders with .md files under the default folder", async () => {
            await app.vault.create("Checklists/Groceries/Milk.md", `---\ncompleted: false\n---\n`);
            await app.vault.create("Checklists/Groceries/Eggs.md", `---\ncompleted: true\n---\n`);
            await app.vault.create("Checklists/Todo/Task1.md", `---\ncompleted: false\n---\n`);

            const discovered = mgr.discoverChecklists("Checklists", []);
            const names = discovered.map((d) => d.name).sort();
            expect(names).toEqual(["Groceries", "Todo"]);
            expect(discovered[0].kind).toBe("checklist");
            expect(discovered[0].folder).toMatch(/^Checklists\//);
            expect(discovered[0].properties).toEqual([]);
        });

        it("skips folders already covered by existing definitions", async () => {
            await app.vault.create("Checklists/Groceries/Milk.md", `---\n---\n`);
            await app.vault.create("Checklists/Todo/Task1.md", `---\n---\n`);
            const existing: ChecklistDefinition[] = [
                { id: "groceries", name: "Groceries", kind: "checklist", folder: "Checklists/Groceries", properties: [] },
            ];

            const discovered = mgr.discoverChecklists("Checklists", existing);
            expect(discovered.length).toBe(1);
            expect(discovered[0].name).toBe("Todo");
        });

        it("discovers root-level folders when defaultFolder is empty", async () => {
            await app.vault.create("Shopping/Apples.md", `---\n---\n`);
            await app.vault.create("Reading/Book1.md", `---\n---\n`);
            await app.vault.create("standalone.md", `---\n---\n`); // root file, no folder

            const discovered = mgr.discoverChecklists("", []);
            const names = discovered.map((d) => d.name).sort();
            expect(names).toEqual(["Reading", "Shopping"]);
            expect(discovered.find((d) => d.name === "Shopping")!.folder).toBe("Shopping");
        });

        it("ignores nested subfolders (only direct children of defaultFolder)", async () => {
            await app.vault.create("Checklists/A/B/deep.md", `---\n---\n`);
            await app.vault.create("Checklists/A/top.md", `---\n---\n`);

            const discovered = mgr.discoverChecklists("Checklists", []);
            expect(discovered.length).toBe(1);
            expect(discovered[0].name).toBe("A");
        });

        it("returns an empty array when no folders match", async () => {
            const discovered = mgr.discoverChecklists("Checklists", []);
            expect(discovered).toEqual([]);
        });

        it("ignores non-.md files", async () => {
            // getMarkdownFiles only returns .md — so non-md is never seen
            // but files at the wrong depth should be skipped
            await app.vault.create("Checklists/top-level.md", `---\n---\n`);

            const discovered = mgr.discoverChecklists("Checklists", []);
            // top-level.md is directly in Checklists, not in a subfolder
            expect(discovered).toEqual([]);
        });

        it("generates a stable id from the folder name", async () => {
            await app.vault.create("Checklists/My Shopping List/item.md", `---\n---\n`);

            const discovered = mgr.discoverChecklists("Checklists", []);
            expect(discovered[0].id).toBe("my-shopping-list");
            expect(discovered[0].name).toBe("My Shopping List");
        });
    });

    describe("validation", () => {
        it("blocks create when a required property is missing", async () => {
            const def: ChecklistDefinition = {
                ...defBase,
                id: "rdef",
                folder: "Rdef",
                properties: [{ key: "author", type: "text", required: true }],
            };
            await expect(mgr.createItem(def, "NoAuthor", {})).rejects.toThrow(/required/i);
        });

        it("blocks create when number fails min validation", async () => {
            const def: ChecklistDefinition = {
                ...defBase,
                id: "n",
                folder: "N",
                properties: [{ key: "pages", type: "number", validation: { min: 1 } }],
            };
            await expect(mgr.createItem(def, "TooLow", { pages: 0 })).rejects.toThrow();
        });
    });
});
