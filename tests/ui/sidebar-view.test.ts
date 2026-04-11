import { App, WorkspaceLeaf } from "obsidian";
import { ChecklistSidebarView } from "src/ui/sidebar-view";
import { ChecklistManager } from "src/core/checklist-manager";
import type { ChecklistDefinition } from "src/core/types";

const def: ChecklistDefinition = {
    id: "books",
    name: "Books",
    kind: "checklist",
    folder: "Books",
    properties: [{ key: "author", type: "text" }],
};

async function makeView(app: App, mgr: ChecklistManager): Promise<ChecklistSidebarView> {
    const leaf = new WorkspaceLeaf();
    const view = new ChecklistSidebarView(leaf, {
        manager: mgr,
        getDefinitions: () => [def],
        saveSettings: async () => {},
        openAddItemModal: async () => {},
        openCreateListModal: async () => {},
    });
    await view.onOpen();
    return view;
}

describe("ChecklistSidebarView", () => {
    let app: App;
    let mgr: ChecklistManager;

    beforeEach(async () => {
        app = new App();
        mgr = new ChecklistManager(app);
        await app.vault.create("Books/Alpha.md", `---\ncompleted: false\nauthor: Alice\n---\n`);
        await app.vault.create("Books/Beta.md", `---\ncompleted: true\nauthor: Bob\n---\n`);
    });

    it("renders in the left leaf and exposes correct view type", async () => {
        const view = await makeView(app, mgr);
        expect(view.getViewType()).toBe("checklist-sidebar");
        expect(view.getDisplayText()).toMatch(/Checklist/i);
    });

    it("renders a toolbar with search input and status filter", async () => {
        const view = await makeView(app, mgr);
        const root = view.contentEl;
        expect(root.querySelector("input.checklist-search")).not.toBeNull();
        expect(root.querySelector("select.checklist-status")).not.toBeNull();
    });

    it("lists items from the selected checklist", async () => {
        const view = await makeView(app, mgr);
        await view.selectChecklist("books");
        const items = view.contentEl.querySelectorAll(".checklist-item");
        expect(items.length).toBe(2);
        const labels = Array.from(items).map((el: Element) => (el.textContent || "").trim());
        expect(labels.some((t) => t.includes("Alpha"))).toBe(true);
        expect(labels.some((t) => t.includes("Beta"))).toBe(true);
    });

    it("filters items via search input (live)", async () => {
        const view = await makeView(app, mgr);
        await view.selectChecklist("books");
        const input = view.contentEl.querySelector("input.checklist-search") as HTMLInputElement;
        input.value = "alp";
        input.dispatchEvent(new Event("input"));
        const items = view.contentEl.querySelectorAll(".checklist-item");
        expect(items.length).toBe(1);
        expect((items[0].textContent || "").trim()).toContain("Alpha");
    });

    it("filters items by status", async () => {
        const view = await makeView(app, mgr);
        await view.selectChecklist("books");
        const select = view.contentEl.querySelector("select.checklist-status") as HTMLSelectElement;
        select.value = "done";
        select.dispatchEvent(new Event("change"));
        const items = view.contentEl.querySelectorAll(".checklist-item");
        expect(items.length).toBe(1);
        expect((items[0].textContent || "").trim()).toContain("Beta");
    });

    it("toggles completion on checkbox click and writes to disk", async () => {
        const view = await makeView(app, mgr);
        await view.selectChecklist("books");
        const alphaRow = Array.from(view.contentEl.querySelectorAll(".checklist-item"))
            .find((el: Element) => (el.textContent || "").includes("Alpha")) as HTMLElement;
        const box = alphaRow.querySelector("input[type=checkbox]") as HTMLInputElement;
        box.checked = true;
        box.dispatchEvent(new Event("change"));
        // Wait a tick for the async update
        await new Promise((r) => setTimeout(r, 0));
        const content = await app.vault.read(app.vault.getMarkdownFiles().find((f) => f.basename === "Alpha")!);
        expect(content).toMatch(/completed: true/);
    });

    it("shows an empty-state message when there are no definitions", async () => {
        const leaf = new WorkspaceLeaf();
        const view = new ChecklistSidebarView(leaf, {
            manager: mgr,
            getDefinitions: () => [],
            saveSettings: async () => {},
            openAddItemModal: async () => {},
            openCreateListModal: async () => {},
        });
        await view.onOpen();
        expect((view.contentEl.textContent || "").toLowerCase()).toContain("no checklist");
    });

    it("sanitizes item names — renders as text, not HTML", async () => {
        await app.vault.create("Books/<img src=x>.md", `---\ncompleted: false\n---\n`);
        const view = await makeView(app, mgr);
        await view.selectChecklist("books");
        const injected = view.contentEl.querySelector("img[src='x']");
        expect(injected).toBeNull();
    });
});
