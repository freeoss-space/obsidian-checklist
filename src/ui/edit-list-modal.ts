import { App, Modal } from "obsidian";
import { assertSafeChecklistName } from "./create-list-modal";
import type { ChecklistDefinition, ChecklistKind } from "../core/types";

export type EditListSubmit = (def: ChecklistDefinition) => void | Promise<void>;

/**
 * Native Obsidian modal for editing an existing checklist definition.
 * Only name and kind are editable — id and folder remain unchanged so
 * that the vault files are not disturbed.
 *
 * Security posture: mirrors CreateListModal — all user-visible text is
 * written via textContent, never innerHTML.
 */
export class EditListModal extends Modal {
    private def: ChecklistDefinition;
    private onSubmit: EditListSubmit;
    private nameInput!: HTMLInputElement;
    private kindSelect!: HTMLSelectElement;
    private errorEl!: HTMLElement;
    private busy = false;
    /** Lifecycle flag toggled by onOpen/onClose. Test-visible. */
    public isOpen = false;

    constructor(app: App, def: ChecklistDefinition, onSubmit: EditListSubmit) {
        super(app);
        this.def = def;
        this.onSubmit = onSubmit;
    }

    onOpen(): void {
        this.isOpen = true;
        this.titleEl.textContent = "Edit checklist";
        const c = this.contentEl;
        c.empty();
        c.addClass("edit-list-modal");

        // Name row
        const nameRow = c.createDiv({ cls: "edit-list-row" });
        nameRow.createEl("label", { text: "Name", cls: "edit-list-label" });
        this.nameInput = nameRow.createEl("input", {
            cls: "edit-list-name",
            attr: { type: "text", maxlength: "120" },
        });
        this.nameInput.value = this.def.name;

        // Kind row
        const kindRow = c.createDiv({ cls: "edit-list-row" });
        kindRow.createEl("label", { text: "Kind", cls: "edit-list-label" });
        this.kindSelect = kindRow.createEl("select", { cls: "edit-list-kind" });
        this.kindSelect.createEl("option", {
            text: "Checklist (with checkboxes)",
            attr: { value: "checklist" },
        });
        this.kindSelect.createEl("option", {
            text: "List (bullets only)",
            attr: { value: "list" },
        });
        this.kindSelect.value = this.def.kind;

        // Error region — empty by default
        this.errorEl = c.createDiv({ cls: "edit-list-error" });
        this.errorEl.setAttribute("role", "alert");

        // Actions row
        const actions = c.createDiv({ cls: "edit-list-actions" });
        const cancelBtn = actions.createEl("button", {
            text: "Cancel",
            cls: "edit-list-cancel",
            attr: { type: "button" },
        });
        cancelBtn.addEventListener("click", () => this.close());

        const submitBtn = actions.createEl("button", {
            text: "Save",
            cls: ["edit-list-submit", "mod-cta"],
            attr: { type: "button" },
        });
        submitBtn.addEventListener("click", () => {
            void this.handleSubmit();
        });

        // Enter-to-submit from the name input.
        this.nameInput.addEventListener("keydown", (evt) => {
            if (evt.key === "Enter") {
                evt.preventDefault();
                void this.handleSubmit();
            }
        });

        queueMicrotask(() => this.nameInput.focus());
    }

    onClose(): void {
        this.isOpen = false;
    }

    private async handleSubmit(): Promise<void> {
        if (this.busy) return;
        this.busy = true;
        try {
            const rawName = this.nameInput.value ?? "";
            const trimmed = rawName.trim();
            try {
                assertSafeChecklistName(trimmed);
            } catch (err) {
                // textContent only — never innerHTML.
                this.errorEl.textContent = (err as Error).message;
                return;
            }
            const kind = (this.kindSelect.value === "list" ? "list" : "checklist") as ChecklistKind;
            const updatedDef: ChecklistDefinition = {
                ...this.def,
                name: trimmed,
                kind,
            };
            this.errorEl.textContent = "";
            try {
                await this.onSubmit(updatedDef);
            } catch (err) {
                this.errorEl.textContent = (err as Error).message;
                return;
            }
            this.close();
        } finally {
            this.busy = false;
        }
    }
}
