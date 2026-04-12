import { App } from "obsidian";
import { CreateListModal } from "src/ui/create-list-modal";

describe("CreateListModal", () => {
    let app: App;

    beforeEach(() => {
        app = new App();
        document.body.innerHTML = "";
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("renders a native Obsidian modal with a title, name input, kind picker, and buttons", () => {
        const modal = new CreateListModal(app, { defaultFolder: "" }, async () => {});
        modal.open();
        const container = modal.contentEl;
        // Input for the checklist name
        expect(container.querySelector("input.create-list-name")).not.toBeNull();
        // Kind (checklist vs list) selector
        expect(container.querySelector("select.create-list-kind")).not.toBeNull();
        // Explicit submit button
        const submit = container.querySelector("button.create-list-submit");
        expect(submit).not.toBeNull();
        expect((submit as HTMLElement).textContent?.toLowerCase()).toContain("create");
        // Cancel button
        expect(container.querySelector("button.create-list-cancel")).not.toBeNull();
        // Title should mention "checklist"
        expect((modal.titleEl.textContent || "").toLowerCase()).toContain("checklist");
    });

    it("invokes the submit callback with a sanitized definition on Create", async () => {
        let received: { id: string; name: string; kind: string; folder: string } | null = null;
        const modal = new CreateListModal(app, { defaultFolder: "Lists" }, async (def) => {
            received = { id: def.id, name: def.name, kind: def.kind, folder: def.folder };
        });
        modal.open();
        const nameInput = modal.contentEl.querySelector(
            "input.create-list-name"
        ) as HTMLInputElement;
        nameInput.value = "  Reading List  ";
        nameInput.dispatchEvent(new Event("input"));
        const submit = modal.contentEl.querySelector(
            "button.create-list-submit"
        ) as HTMLButtonElement;
        submit.click();
        await new Promise((r) => setTimeout(r, 0));
        expect(received).not.toBeNull();
        expect(received!.name).toBe("Reading List");
        expect(received!.id).toBe("reading-list");
        expect(received!.kind).toBe("checklist");
        expect(received!.folder).toBe("Lists/Reading List");
    });

    it("closes after a successful submit", async () => {
        const modal = new CreateListModal(app, { defaultFolder: "" }, async () => {});
        modal.open();
        const nameInput = modal.contentEl.querySelector(
            "input.create-list-name"
        ) as HTMLInputElement;
        nameInput.value = "Books";
        nameInput.dispatchEvent(new Event("input"));
        const submit = modal.contentEl.querySelector(
            "button.create-list-submit"
        ) as HTMLButtonElement;
        submit.click();
        await new Promise((r) => setTimeout(r, 0));
        expect(modal.isOpen).toBe(false);
    });

    it("shows a validation error and does not submit on empty name", async () => {
        let called = false;
        const modal = new CreateListModal(app, { defaultFolder: "" }, async () => {
            called = true;
        });
        modal.open();
        const submit = modal.contentEl.querySelector(
            "button.create-list-submit"
        ) as HTMLButtonElement;
        submit.click();
        await new Promise((r) => setTimeout(r, 0));
        expect(called).toBe(false);
        expect(modal.isOpen).toBe(true);
        const err = modal.contentEl.querySelector(".create-list-error");
        expect(err).not.toBeNull();
        expect((err!.textContent || "").length).toBeGreaterThan(0);
    });

    it("rejects path traversal and control characters", async () => {
        let called = false;
        const modal = new CreateListModal(app, { defaultFolder: "" }, async () => {
            called = true;
        });
        modal.open();
        const nameInput = modal.contentEl.querySelector(
            "input.create-list-name"
        ) as HTMLInputElement;
        nameInput.value = "../../etc/passwd";
        nameInput.dispatchEvent(new Event("input"));
        const submit = modal.contentEl.querySelector(
            "button.create-list-submit"
        ) as HTMLButtonElement;
        submit.click();
        await new Promise((r) => setTimeout(r, 0));
        expect(called).toBe(false);
        expect(modal.isOpen).toBe(true);
    });

    it("renders any error message as text — never as HTML (XSS hard-gate)", async () => {
        const modal = new CreateListModal(app, { defaultFolder: "" }, async () => {});
        modal.open();
        const nameInput = modal.contentEl.querySelector(
            "input.create-list-name"
        ) as HTMLInputElement;
        nameInput.value = "<img src=x onerror=alert(1)>";
        nameInput.dispatchEvent(new Event("input"));
        const submit = modal.contentEl.querySelector(
            "button.create-list-submit"
        ) as HTMLButtonElement;
        submit.click();
        await new Promise((r) => setTimeout(r, 0));
        // The error region must not contain a parsed <img> element.
        const err = modal.contentEl.querySelector(".create-list-error");
        expect(err).not.toBeNull();
        expect(err!.querySelector("img")).toBeNull();
    });

    it("Cancel closes the modal without calling submit", async () => {
        let called = false;
        const modal = new CreateListModal(app, { defaultFolder: "" }, async () => {
            called = true;
        });
        modal.open();
        const nameInput = modal.contentEl.querySelector(
            "input.create-list-name"
        ) as HTMLInputElement;
        nameInput.value = "Whatever";
        nameInput.dispatchEvent(new Event("input"));
        const cancel = modal.contentEl.querySelector(
            "button.create-list-cancel"
        ) as HTMLButtonElement;
        cancel.click();
        expect(called).toBe(false);
        expect(modal.isOpen).toBe(false);
    });
});
