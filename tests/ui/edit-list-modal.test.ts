import { App } from "obsidian";
import { EditListModal } from "src/ui/edit-list-modal";
import type { ChecklistDefinition } from "src/core/types";

const existingDef: ChecklistDefinition = {
    id: "books",
    name: "Books",
    kind: "checklist",
    folder: "Books",
    properties: [{ key: "author", type: "text" }],
};

describe("EditListModal", () => {
    let app: App;

    beforeEach(() => {
        app = new App();
        document.body.innerHTML = "";
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("renders a modal with title, pre-filled name input, kind picker, and buttons", () => {
        const modal = new EditListModal(app, existingDef, async () => {});
        modal.open();
        const c = modal.contentEl;
        const nameInput = c.querySelector("input.edit-list-name") as HTMLInputElement;
        expect(nameInput).not.toBeNull();
        expect(nameInput.value).toBe("Books");
        expect(c.querySelector("select.edit-list-kind")).not.toBeNull();
        expect(c.querySelector("button.edit-list-submit")).not.toBeNull();
        expect(c.querySelector("button.edit-list-cancel")).not.toBeNull();
        expect((modal.titleEl.textContent || "").toLowerCase()).toContain("edit");
    });

    it("pre-selects the current kind in the dropdown", () => {
        const listDef = { ...existingDef, kind: "list" as const };
        const modal = new EditListModal(app, listDef, async () => {});
        modal.open();
        const select = modal.contentEl.querySelector("select.edit-list-kind") as HTMLSelectElement;
        expect(select.value).toBe("list");
    });

    it("calls onSubmit with updated definition on Save", async () => {
        let received: ChecklistDefinition | null = null;
        const modal = new EditListModal(app, existingDef, async (def) => {
            received = def;
        });
        modal.open();
        const nameInput = modal.contentEl.querySelector("input.edit-list-name") as HTMLInputElement;
        nameInput.value = "My Books";
        const submitBtn = modal.contentEl.querySelector("button.edit-list-submit") as HTMLButtonElement;
        submitBtn.click();
        await new Promise((r) => setTimeout(r, 0));
        expect(received).not.toBeNull();
        expect(received!.name).toBe("My Books");
        // id and folder unchanged
        expect(received!.id).toBe("books");
        expect(received!.folder).toBe("Books");
    });

    it("closes after a successful save", async () => {
        const modal = new EditListModal(app, existingDef, async () => {});
        modal.open();
        const nameInput = modal.contentEl.querySelector("input.edit-list-name") as HTMLInputElement;
        nameInput.value = "Updated Name";
        const submitBtn = modal.contentEl.querySelector("button.edit-list-submit") as HTMLButtonElement;
        submitBtn.click();
        await new Promise((r) => setTimeout(r, 0));
        expect(modal.isOpen).toBe(false);
    });

    it("shows a validation error and does not submit on empty name", async () => {
        let called = false;
        const modal = new EditListModal(app, existingDef, async () => { called = true; });
        modal.open();
        const nameInput = modal.contentEl.querySelector("input.edit-list-name") as HTMLInputElement;
        nameInput.value = "";
        const submitBtn = modal.contentEl.querySelector("button.edit-list-submit") as HTMLButtonElement;
        submitBtn.click();
        await new Promise((r) => setTimeout(r, 0));
        expect(called).toBe(false);
        expect(modal.isOpen).toBe(true);
        const err = modal.contentEl.querySelector(".edit-list-error");
        expect(err).not.toBeNull();
        expect((err!.textContent || "").length).toBeGreaterThan(0);
    });

    it("Cancel closes the modal without calling onSubmit", async () => {
        let called = false;
        const modal = new EditListModal(app, existingDef, async () => { called = true; });
        modal.open();
        const cancelBtn = modal.contentEl.querySelector("button.edit-list-cancel") as HTMLButtonElement;
        cancelBtn.click();
        expect(called).toBe(false);
        expect(modal.isOpen).toBe(false);
    });

    it("renders error messages as text — never as HTML (XSS hard-gate)", async () => {
        const modal = new EditListModal(app, existingDef, async () => {});
        modal.open();
        const nameInput = modal.contentEl.querySelector("input.edit-list-name") as HTMLInputElement;
        nameInput.value = "<img src=x onerror=alert(1)>";
        const submitBtn = modal.contentEl.querySelector("button.edit-list-submit") as HTMLButtonElement;
        submitBtn.click();
        await new Promise((r) => setTimeout(r, 0));
        const err = modal.contentEl.querySelector(".edit-list-error");
        expect(err).not.toBeNull();
        expect(err!.querySelector("img")).toBeNull();
    });

    it("updated kind is passed to onSubmit", async () => {
        let received: ChecklistDefinition | null = null;
        const modal = new EditListModal(app, existingDef, async (def) => { received = def; });
        modal.open();
        const kindSelect = modal.contentEl.querySelector("select.edit-list-kind") as HTMLSelectElement;
        kindSelect.value = "list";
        const submitBtn = modal.contentEl.querySelector("button.edit-list-submit") as HTMLButtonElement;
        submitBtn.click();
        await new Promise((r) => setTimeout(r, 0));
        expect(received!.kind).toBe("list");
    });
});
