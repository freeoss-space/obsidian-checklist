import { App } from "obsidian";
import { ShareToChecklistModal } from "src/ui/share-to-checklist-modal";
import { ChecklistManager } from "src/core/checklist-manager";
import type { ChecklistDefinition } from "src/core/types";

const defA: ChecklistDefinition = {
    id: "reading",
    name: "Reading",
    kind: "checklist",
    folder: "Reading",
    properties: [],
};

const defB: ChecklistDefinition = {
    id: "links",
    name: "Links",
    kind: "list",
    folder: "Links",
    properties: [],
};

describe("ShareToChecklistModal", () => {
    let app: App;
    let mgr: ChecklistManager;

    beforeEach(() => {
        app = new App();
        mgr = new ChecklistManager(app);
        document.body.innerHTML = "";
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("renders a picker for each definition, a name input, and a submit button", () => {
        const modal = new ShareToChecklistModal(app, mgr, {
            shared: "Sample shared text",
            definitions: [defA, defB],
            onItemAdded: () => {},
        });
        modal.open();
        const root = modal.contentEl;
        expect(root.querySelector("select.share-checklist-picker")).not.toBeNull();
        expect(root.querySelector("input.share-item-name")).not.toBeNull();
        expect(root.querySelector("button.share-submit")).not.toBeNull();
        expect(root.querySelector("button.share-cancel")).not.toBeNull();
        const opts = root.querySelectorAll("select.share-checklist-picker option");
        // two real options — we don't require a placeholder.
        const values = Array.from(opts).map((o) => (o as HTMLOptionElement).value);
        expect(values).toContain("reading");
        expect(values).toContain("links");
    });

    it("pre-fills the name with the first line of shared text (trimmed)", () => {
        const modal = new ShareToChecklistModal(app, mgr, {
            shared: "  Buy milk  \nAnd eggs",
            definitions: [defA],
            onItemAdded: () => {},
        });
        modal.open();
        const nameInput = modal.contentEl.querySelector("input.share-item-name") as HTMLInputElement;
        expect(nameInput.value).toBe("Buy milk");
    });

    it("truncates very long shared text when pre-filling the name", () => {
        const huge = "x".repeat(2000);
        const modal = new ShareToChecklistModal(app, mgr, {
            shared: huge,
            definitions: [defA],
            onItemAdded: () => {},
        });
        modal.open();
        const nameInput = modal.contentEl.querySelector("input.share-item-name") as HTMLInputElement;
        // Hard gate: the input value must fit within the SAFE_NAME length cap.
        expect(nameInput.value.length).toBeLessThanOrEqual(120);
    });

    it("shows an empty-state message when there are no definitions", () => {
        const modal = new ShareToChecklistModal(app, mgr, {
            shared: "anything",
            definitions: [],
            onItemAdded: () => {},
        });
        modal.open();
        expect((modal.contentEl.textContent || "").toLowerCase()).toContain("no checklist");
        // Hard gate: no submit button at all in empty state.
        expect(modal.contentEl.querySelector("button.share-submit")).toBeNull();
    });

    it("creates a checklist item in the selected definition on submit", async () => {
        // Load both definitions so the manager has a cache entry for each —
        // createItem only appends to an existing cache.
        await mgr.loadItems(defA);
        await mgr.loadItems(defB);
        let addedTo: string | null = null;
        const modal = new ShareToChecklistModal(app, mgr, {
            shared: "A cool link",
            definitions: [defA, defB],
            onItemAdded: (id) => {
                addedTo = id;
            },
        });
        modal.open();
        const picker = modal.contentEl.querySelector("select.share-checklist-picker") as HTMLSelectElement;
        picker.value = "links";
        picker.dispatchEvent(new Event("change"));
        const nameInput = modal.contentEl.querySelector("input.share-item-name") as HTMLInputElement;
        nameInput.value = "Sanitized Name";
        nameInput.dispatchEvent(new Event("input"));
        (modal.contentEl.querySelector("button.share-submit") as HTMLButtonElement).click();
        await new Promise((r) => setTimeout(r, 0));
        expect(addedTo).toBe("links");
        // File was created on disk
        expect(app.vault.getAbstractFileByPath("Links/Sanitized Name.md")).not.toBeNull();
        // And cached in the manager
        const items = mgr.getCachedItems(defB);
        expect(items.map((i) => i.name)).toContain("Sanitized Name");
        expect(modal.isOpen).toBe(false);
    });

    it("refuses unsafe names and keeps the modal open", async () => {
        let added = false;
        const modal = new ShareToChecklistModal(app, mgr, {
            shared: "",
            definitions: [defA],
            onItemAdded: () => {
                added = true;
            },
        });
        modal.open();
        const nameInput = modal.contentEl.querySelector("input.share-item-name") as HTMLInputElement;
        nameInput.value = "../../etc/passwd";
        nameInput.dispatchEvent(new Event("input"));
        (modal.contentEl.querySelector("button.share-submit") as HTMLButtonElement).click();
        await new Promise((r) => setTimeout(r, 0));
        expect(added).toBe(false);
        expect(modal.isOpen).toBe(true);
        const err = modal.contentEl.querySelector(".share-error");
        expect(err).not.toBeNull();
        expect((err!.textContent || "").length).toBeGreaterThan(0);
    });

    it("refuses empty name and keeps the modal open", async () => {
        let added = false;
        const modal = new ShareToChecklistModal(app, mgr, {
            shared: "",
            definitions: [defA],
            onItemAdded: () => {
                added = true;
            },
        });
        modal.open();
        (modal.contentEl.querySelector("button.share-submit") as HTMLButtonElement).click();
        await new Promise((r) => setTimeout(r, 0));
        expect(added).toBe(false);
        expect(modal.isOpen).toBe(true);
    });

    it("never renders error messages as HTML (XSS hard-gate)", async () => {
        const modal = new ShareToChecklistModal(app, mgr, {
            shared: "",
            definitions: [defA],
            onItemAdded: () => {},
        });
        modal.open();
        const nameInput = modal.contentEl.querySelector("input.share-item-name") as HTMLInputElement;
        nameInput.value = "<img src=x onerror=alert(1)>";
        nameInput.dispatchEvent(new Event("input"));
        (modal.contentEl.querySelector("button.share-submit") as HTMLButtonElement).click();
        await new Promise((r) => setTimeout(r, 0));
        const err = modal.contentEl.querySelector(".share-error");
        expect(err).not.toBeNull();
        expect(err!.querySelector("img")).toBeNull();
    });

    it("Cancel closes the modal without creating an item", async () => {
        let added = false;
        const modal = new ShareToChecklistModal(app, mgr, {
            shared: "",
            definitions: [defA],
            onItemAdded: () => {
                added = true;
            },
        });
        modal.open();
        const nameInput = modal.contentEl.querySelector("input.share-item-name") as HTMLInputElement;
        nameInput.value = "Whatever";
        nameInput.dispatchEvent(new Event("input"));
        (modal.contentEl.querySelector("button.share-cancel") as HTMLButtonElement).click();
        expect(added).toBe(false);
        expect(modal.isOpen).toBe(false);
    });
});
