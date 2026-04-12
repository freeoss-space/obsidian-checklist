import { WorkspaceLeaf } from "obsidian";
import { ChecklistSidebarView, ChecklistSidebarDeps } from "src/ui/sidebar-view";
import type { ChecklistDefinition } from "src/core/types";

const defBooks: ChecklistDefinition = {
    id: "books",
    name: "Books",
    kind: "checklist",
    folder: "Books",
    properties: [{ key: "author", type: "text" }],
};

const defGroceries: ChecklistDefinition = {
    id: "groceries",
    name: "Groceries",
    kind: "list",
    folder: "Groceries",
    properties: [],
};

function makeDeps(overrides: Partial<ChecklistSidebarDeps> = {}): ChecklistSidebarDeps {
    return {
        getDefinitions: () => [defBooks, defGroceries],
        openCreateListModal: jest.fn(),
        openEditListModal: jest.fn(),
        onDeleteList: jest.fn().mockResolvedValue(undefined),
        onSelectList: jest.fn().mockResolvedValue(undefined),
        ...overrides,
    };
}

async function makeView(deps: ChecklistSidebarDeps): Promise<ChecklistSidebarView> {
    const leaf = new WorkspaceLeaf();
    const view = new ChecklistSidebarView(leaf, deps);
    await view.onOpen();
    return view;
}

describe("ChecklistSidebarView (list management)", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("exposes the correct view type", async () => {
        const view = await makeView(makeDeps());
        expect(view.getViewType()).toBe("checklist-sidebar");
        expect(view.getDisplayText()).toMatch(/checklist/i);
    });

    it("renders a + New list button", async () => {
        const view = await makeView(makeDeps());
        const btn = view.contentEl.querySelector("button.checklist-new-list");
        expect(btn).not.toBeNull();
        expect(btn!.textContent).toContain("New list");
    });

    it("clicking + New list calls openCreateListModal", async () => {
        const deps = makeDeps();
        const view = await makeView(deps);
        const btn = view.contentEl.querySelector("button.checklist-new-list") as HTMLButtonElement;
        btn.click();
        expect(deps.openCreateListModal).toHaveBeenCalledTimes(1);
    });

    it("renders one row per definition", async () => {
        const view = await makeView(makeDeps());
        const rows = view.contentEl.querySelectorAll(".checklist-sidebar-row");
        expect(rows.length).toBe(2);
    });

    it("each row shows the definition name", async () => {
        const view = await makeView(makeDeps());
        const rows = view.contentEl.querySelectorAll(".checklist-sidebar-row");
        const texts = Array.from(rows).map((r) => r.textContent || "");
        expect(texts.some((t) => t.includes("Books"))).toBe(true);
        expect(texts.some((t) => t.includes("Groceries"))).toBe(true);
    });

    it("each row has an edit button and a delete button", async () => {
        const view = await makeView(makeDeps());
        const rows = view.contentEl.querySelectorAll(".checklist-sidebar-row");
        for (const row of Array.from(rows)) {
            expect(row.querySelector("button.checklist-sidebar-edit")).not.toBeNull();
            expect(row.querySelector("button.checklist-sidebar-delete")).not.toBeNull();
        }
    });

    it("clicking a list name calls onSelectList with the definition id", async () => {
        const deps = makeDeps();
        const view = await makeView(deps);
        const nameBtn = view.contentEl.querySelector(".checklist-sidebar-name") as HTMLButtonElement;
        nameBtn.click();
        await new Promise((r) => setTimeout(r, 0));
        expect(deps.onSelectList).toHaveBeenCalledWith(defBooks.id);
    });

    it("clicking the edit button calls openEditListModal with the definition", async () => {
        const deps = makeDeps();
        const view = await makeView(deps);
        const editBtns = view.contentEl.querySelectorAll("button.checklist-sidebar-edit");
        (editBtns[0] as HTMLButtonElement).click();
        expect(deps.openEditListModal).toHaveBeenCalledWith(defBooks);
    });

    it("clicking delete opens a confirmation modal", async () => {
        const deps = makeDeps();
        const view = await makeView(deps);
        const deleteBtns = view.contentEl.querySelectorAll("button.checklist-sidebar-delete");
        (deleteBtns[0] as HTMLButtonElement).click();
        // The confirmation modal should be present in the DOM
        const modal = document.body.querySelector(".confirm-delete-modal");
        expect(modal).not.toBeNull();
    });

    it("confirming delete calls onDeleteList with the definition id", async () => {
        const deps = makeDeps();
        const view = await makeView(deps);
        const deleteBtns = view.contentEl.querySelectorAll("button.checklist-sidebar-delete");
        (deleteBtns[0] as HTMLButtonElement).click();
        const confirmBtn = document.body.querySelector("button.confirm-delete-confirm") as HTMLButtonElement;
        expect(confirmBtn).not.toBeNull();
        confirmBtn.click();
        await new Promise((r) => setTimeout(r, 0));
        expect(deps.onDeleteList).toHaveBeenCalledWith(defBooks.id);
    });

    it("cancelling delete does NOT call onDeleteList", async () => {
        const deps = makeDeps();
        const view = await makeView(deps);
        const deleteBtns = view.contentEl.querySelectorAll("button.checklist-sidebar-delete");
        (deleteBtns[0] as HTMLButtonElement).click();
        const cancelBtn = document.body.querySelector("button.confirm-delete-cancel") as HTMLButtonElement;
        cancelBtn.click();
        await new Promise((r) => setTimeout(r, 0));
        expect(deps.onDeleteList).not.toHaveBeenCalled();
    });

    it("shows an empty-state message when there are no definitions", async () => {
        const deps = makeDeps({ getDefinitions: () => [] });
        const view = await makeView(deps);
        expect((view.contentEl.textContent || "").toLowerCase()).toContain("no checklist");
    });

    it("does NOT render checklist items, search input, or status filter", async () => {
        const view = await makeView(makeDeps());
        expect(view.contentEl.querySelector(".checklist-item")).toBeNull();
        expect(view.contentEl.querySelector("input.checklist-search")).toBeNull();
        expect(view.contentEl.querySelector("select.checklist-status")).toBeNull();
    });

    it("refresh re-renders the definition list", async () => {
        let defs = [defBooks];
        const deps = makeDeps({ getDefinitions: () => defs });
        const view = await makeView(deps);
        expect(view.contentEl.querySelectorAll(".checklist-sidebar-row").length).toBe(1);

        defs = [defBooks, defGroceries];
        view.refresh();
        expect(view.contentEl.querySelectorAll(".checklist-sidebar-row").length).toBe(2);
    });
});
