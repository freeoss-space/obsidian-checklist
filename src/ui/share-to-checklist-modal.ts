import { App, Modal, Notice } from "obsidian";
import type { ChecklistManager } from "../core/checklist-manager";
import type { ChecklistDefinition } from "../core/types";
import { assertSafeChecklistName } from "./create-list-modal";

export interface ShareToChecklistModalOptions {
    /** The text / URL handed to us by the share-sheet event. */
    shared: string;
    /** Every checklist the user has configured. */
    definitions: ChecklistDefinition[];
    /** Notified with the destination definition's id on successful add. */
    onItemAdded: (id: string) => void;
    /** Optional id of a default destination. */
    defaultDefinitionId?: string;
}

/**
 * Mobile share-intent target. Opens when the user taps the plugin's entry
 * in the OS share sheet / Obsidian's share-sheet menu and lets them pick
 * a destination checklist, tweak the name, then create the item.
 *
 * Security posture:
 *  - Name passes through {@link assertSafeChecklistName}: traversal,
 *    control characters, reserved names, and oversized input are blocked
 *    *before* the vault is touched.
 *  - Shared text is *never* written to the DOM as HTML — only via
 *    `textContent` / form values / attribute setters.
 *  - The pre-filled name is truncated to `MAX_NAME_LEN` so a multi-MB
 *    share payload cannot waste CPU in validation / DOM paint.
 *
 * Performance posture:
 *  - Single DOM pass on open, no timers, no observers. All listeners go
 *    away with the modal node on close.
 *  - Only the first line of the shared text is scanned for the default
 *    name (O(length) up to 1 KB — the rest is ignored).
 */
const MAX_NAME_LEN = 120;
const FIRST_LINE_SCAN_CAP = 1024;

/** Pull a sane default item name out of possibly-huge shared text. */
export function deriveItemName(shared: string): string {
    if (typeof shared !== "string" || shared.length === 0) return "";
    // Only look at the head of the payload — shared text could be a
    // pasted article. Avoid scanning megabytes to find the newline.
    const head = shared.slice(0, FIRST_LINE_SCAN_CAP);
    const nl = head.indexOf("\n");
    const firstLine = (nl === -1 ? head : head.slice(0, nl)).trim();
    return firstLine.slice(0, MAX_NAME_LEN);
}

export class ShareToChecklistModal extends Modal {
    private manager: ChecklistManager;
    private options: ShareToChecklistModalOptions;
    private selectedId = "";
    private itemName = "";
    private busy = false;
    private picker: HTMLSelectElement | null = null;
    private nameInput: HTMLInputElement | null = null;
    private errorEl: HTMLElement | null = null;
    /** Lifecycle flag toggled by onOpen/onClose. Test-visible. */
    public isOpen = false;

    constructor(app: App, manager: ChecklistManager, options: ShareToChecklistModalOptions) {
        super(app);
        this.manager = manager;
        this.options = options;
        this.itemName = deriveItemName(options.shared);
        if (options.defaultDefinitionId &&
            options.definitions.some((d) => d.id === options.defaultDefinitionId)) {
            this.selectedId = options.defaultDefinitionId;
        } else if (options.definitions.length > 0) {
            this.selectedId = options.definitions[0].id;
        }
    }

    onOpen(): void {
        this.isOpen = true;
        this.titleEl.textContent = "Add to Checklist";
        const c = this.contentEl;
        c.empty();
        c.addClass("share-to-checklist-modal");

        if (this.options.definitions.length === 0) {
            const empty = c.createDiv({ cls: "share-empty" });
            empty.textContent =
                "No checklists yet. Create one first, then share here again.";
            const actions = c.createDiv({ cls: "share-actions" });
            const closeBtn = actions.createEl("button", {
                text: "Close",
                cls: "share-cancel",
                attr: { type: "button" },
            });
            closeBtn.addEventListener("click", () => this.close());
            return;
        }

        // Checklist picker row
        const pickerRow = c.createDiv({ cls: "share-row" });
        pickerRow.createEl("label", { text: "Checklist", cls: "share-label" });
        this.picker = pickerRow.createEl("select", { cls: "share-checklist-picker" });
        for (const d of this.options.definitions) {
            const opt = this.picker.createEl("option", {
                text: d.name,
                attr: { value: d.id },
            });
            if (d.id === this.selectedId) opt.selected = true;
        }
        this.picker.addEventListener("change", () => {
            this.selectedId = this.picker?.value ?? "";
        });

        // Name row
        const nameRow = c.createDiv({ cls: "share-row" });
        nameRow.createEl("label", { text: "Item name", cls: "share-label" });
        this.nameInput = nameRow.createEl("input", {
            cls: "share-item-name",
            attr: {
                type: "text",
                maxlength: String(MAX_NAME_LEN),
                placeholder: "Item name",
            },
        });
        this.nameInput.value = this.itemName;
        this.nameInput.addEventListener("input", () => {
            this.itemName = this.nameInput?.value ?? "";
            this.clearError();
        });

        // Preview of the shared payload — textContent only.
        if (this.options.shared && this.options.shared.length > 0) {
            const previewRow = c.createDiv({ cls: "share-row" });
            previewRow.createEl("label", { text: "Shared text", cls: "share-label" });
            const preview = previewRow.createEl("div", { cls: "share-preview" });
            // Hard-cap on the preview length to keep the DOM small.
            preview.textContent = this.options.shared.slice(0, 2000);
        }

        // Error region
        this.errorEl = c.createDiv({ cls: "share-error" });
        this.errorEl.setAttribute("role", "alert");

        // Actions
        const actions = c.createDiv({ cls: "share-actions" });
        const cancelBtn = actions.createEl("button", {
            text: "Cancel",
            cls: "share-cancel",
            attr: { type: "button" },
        });
        cancelBtn.addEventListener("click", () => this.close());

        const submitBtn = actions.createEl("button", {
            text: "Add item",
            cls: ["share-submit", "mod-cta"],
            attr: { type: "button" },
        });
        submitBtn.addEventListener("click", () => {
            void this.handleSubmit();
        });

        // Focus the name field for fast input.
        queueMicrotask(() => this.nameInput?.focus());
    }

    onClose(): void {
        this.isOpen = false;
    }

    private showError(message: string): void {
        if (this.errorEl) this.errorEl.textContent = message;
    }
    private clearError(): void {
        if (this.errorEl) this.errorEl.textContent = "";
    }

    private async handleSubmit(): Promise<void> {
        if (this.busy) return;
        this.busy = true;
        try {
            const def = this.options.definitions.find((d) => d.id === this.selectedId);
            if (!def) {
                this.showError("Please select a checklist.");
                return;
            }
            const name = (this.itemName ?? "").trim();
            try {
                assertSafeChecklistName(name);
            } catch (err) {
                this.showError((err as Error).message);
                return;
            }
            try {
                await this.manager.createItem(def, name, {});
            } catch (err) {
                this.showError((err as Error).message);
                return;
            }
            new Notice(`Added "${name}" to ${def.name}`);
            this.options.onItemAdded(def.id);
            this.close();
        } finally {
            this.busy = false;
        }
    }
}
