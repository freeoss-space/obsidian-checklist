import { App, WorkspaceLeaf } from "obsidian";
import { ChecklistMainView, ChecklistMainViewDeps } from "src/ui/checklist-main-view";
import { ChecklistManager } from "src/core/checklist-manager";
import type { ChecklistDefinition } from "src/core/types";

const def: ChecklistDefinition = {
    id: "books",
    name: "Books",
    kind: "checklist",
    folder: "Books",
    properties: [{ key: "author", type: "text" }],
};

function makeDeps(
    mgr: ChecklistManager,
    overrides: Partial<ChecklistMainViewDeps> = {}
): ChecklistMainViewDeps {
    return {
        manager: mgr,
        getDefinitions: () => [def],
        saveSettings: jest.fn().mockResolvedValue(undefined),
        openAddItemModal: jest.fn().mockResolvedValue(undefined),
        ...overrides,
    };
}

async function makeView(app: App, mgr: ChecklistManager, overrides: Partial<ChecklistMainViewDeps> = {}): Promise<ChecklistMainView> {
    const leaf = new WorkspaceLeaf();
    const view = new ChecklistMainView(leaf, makeDeps(mgr, overrides));
    await view.onOpen();
    return view;
}

describe("ChecklistMainView (items display)", () => {
    let app: App;
    let mgr: ChecklistManager;

    beforeEach(async () => {
        app = new App();
        mgr = new ChecklistManager(app);
        await app.vault.create("Books/Alpha.md", `---\ncompleted: false\nauthor: Alice\n---\n`);
        await app.vault.create("Books/Beta.md", `---\ncompleted: true\nauthor: Bob\n---\n`);
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("exposes the correct view type", async () => {
        const view = await makeView(app, mgr);
        expect(view.getViewType()).toBe("checklist-main");
        expect(view.getDisplayText()).toMatch(/checklist/i);
    });

    it("shows an empty state when no checklist is selected", async () => {
        const view = await makeView(app, mgr, { getDefinitions: () => [] });
        expect((view.contentEl.textContent || "").toLowerCase()).toContain("no checklist");
    });

    it("renders toolbar with search, status filter, and add button after selectChecklist", async () => {
        const view = await makeView(app, mgr);
        await view.selectChecklist("books");
        const root = view.contentEl;
        expect(root.querySelector("input.checklist-search")).not.toBeNull();
        expect(root.querySelector("select.checklist-status")).not.toBeNull();
        expect(root.querySelector("button.checklist-add")).not.toBeNull();
    });

    it("lists items from the selected checklist", async () => {
        const view = await makeView(app, mgr);
        await view.selectChecklist("books");
        const items = view.contentEl.querySelectorAll(".checklist-item");
        expect(items.length).toBe(2);
        const labels = Array.from(items).map((el) => (el.textContent || "").trim());
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
            .find((el) => (el.textContent || "").includes("Alpha")) as HTMLElement;
        const box = alphaRow.querySelector("input[type=checkbox]") as HTMLInputElement;
        box.checked = true;
        box.dispatchEvent(new Event("change"));
        await new Promise((r) => setTimeout(r, 0));
        const content = await app.vault.read(
            app.vault.getMarkdownFiles().find((f) => f.basename === "Alpha")!
        );
        expect(content).toMatch(/completed: true/);
    });

    it("+ Add button calls openAddItemModal with the active definition", async () => {
        const openAddItemModal = jest.fn().mockResolvedValue(undefined);
        const view = await makeView(app, mgr, { openAddItemModal });
        await view.selectChecklist("books");
        const addBtn = view.contentEl.querySelector("button.checklist-add") as HTMLButtonElement;
        addBtn.click();
        await new Promise((r) => setTimeout(r, 0));
        expect(openAddItemModal).toHaveBeenCalledWith(def);
    });

    it("sanitizes item names — renders as text, not HTML", async () => {
        await app.vault.create("Books/<img src=x>.md", `---\ncompleted: false\n---\n`);
        const view = await makeView(app, mgr);
        await view.selectChecklist("books");
        const injected = view.contentEl.querySelector("img[src='x']");
        expect(injected).toBeNull();
    });

    it("shows empty-items message when all items are filtered out", async () => {
        const view = await makeView(app, mgr);
        await view.selectChecklist("books");
        const input = view.contentEl.querySelector("input.checklist-search") as HTMLInputElement;
        input.value = "zzz-no-match";
        input.dispatchEvent(new Event("input"));
        expect((view.contentEl.textContent || "").toLowerCase()).toContain("no items");
    });

    it("does NOT render a list-management + New list button or edit/delete buttons", async () => {
        const view = await makeView(app, mgr);
        await view.selectChecklist("books");
        expect(view.contentEl.querySelector("button.checklist-new-list")).toBeNull();
        expect(view.contentEl.querySelector("button.checklist-sidebar-edit")).toBeNull();
        expect(view.contentEl.querySelector("button.checklist-sidebar-delete")).toBeNull();
    });
});
