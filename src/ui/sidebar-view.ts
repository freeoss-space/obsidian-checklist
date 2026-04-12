import { App, ItemView, Modal, WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_CHECKLIST } from "../constants";
import type { ChecklistDefinition } from "../core/types";

/**
 * Callbacks the sidebar view needs from the plugin. Keeping this as a plain
 * dependency object instead of a hard reference to `Plugin` lets us unit test
 * the view in isolation.
 */
export interface ChecklistSidebarDeps {
    getDefinitions: () => ChecklistDefinition[];
    /** Open the native modal for creating a new checklist. */
    openCreateListModal: () => void;
    /** Open the native modal for editing an existing checklist's properties. */
    openEditListModal: (def: ChecklistDefinition) => void;
    /** Delete the checklist with the given id from settings and disk. */
    onDeleteList: (id: string) => Promise<void>;
    /** Open (or focus) the main content view showing items for this checklist. */
    onSelectList: (id: string) => Promise<void>;
}

/**
 * Inline confirmation modal shown when the user clicks "Delete" on a list row.
 * Not exported — it is an implementation detail of the sidebar.
 */
class ConfirmDeleteModal extends Modal {
    private def: ChecklistDefinition;
    private onConfirm: () => Promise<void>;

    constructor(app: App, def: ChecklistDefinition, onConfirm: () => Promise<void>) {
        super(app);
        this.def = def;
        this.onConfirm = onConfirm;
    }

    onOpen(): void {
        // Add a stable class to the modal element so tests can query it.
        this.modalEl.addClass("confirm-delete-modal");
        this.titleEl.textContent = "Delete checklist";
        const c = this.contentEl;
        c.empty();
        // textContent only — never innerHTML.
        const msg = c.createEl("p", { cls: "confirm-delete-message" });
        msg.textContent = `Delete "${this.def.name}"? This cannot be undone.`;

        const actions = c.createDiv({ cls: "confirm-delete-actions" });
        const cancelBtn = actions.createEl("button", {
            text: "Cancel",
            cls: "confirm-delete-cancel",
            attr: { type: "button" },
        });
        cancelBtn.addEventListener("click", () => this.close());

        const confirmBtn = actions.createEl("button", {
            text: "Delete",
            cls: ["confirm-delete-confirm", "mod-warning"],
            attr: { type: "button" },
        });
        confirmBtn.addEventListener("click", async () => {
            await this.onConfirm();
            this.close();
        });
    }

    onClose(): void {
        this.contentEl.empty();
    }
}

/**
 * The LEFT sidebar panel. Handles checklist management — creating, editing,
 * deleting, and navigating to lists.
 *
 * Layout:
 *   ┌──────────────────────────┐
 *   │ Checklists  [+ New list] │  ← header
 *   ├──────────────────────────┤
 *   │ Books      [Edit][Delete]│
 *   │ Groceries  [Edit][Delete]│  ← list rows
 *   └──────────────────────────┘
 *
 * Actual checklist items are rendered in the main content area
 * (ChecklistMainView). Clicking a row name opens that view.
 */
export class ChecklistSidebarView extends ItemView {
    private deps: ChecklistSidebarDeps;

    constructor(leaf: WorkspaceLeaf, deps: ChecklistSidebarDeps) {
        super(leaf);
        this.deps = deps;
    }

    getViewType(): string {
        return VIEW_TYPE_CHECKLIST;
    }

    getDisplayText(): string {
        return "Checklists";
    }

    getIcon(): string {
        return "check-square";
    }

    async onOpen(): Promise<void> {
        this.render();
    }

    async onClose(): Promise<void> {
        this.contentEl.empty();
    }

    /**
     * Re-render the list of definitions (e.g., after a list is added, edited,
     * or deleted). Called by the plugin after settings change.
     */
    refresh(): void {
        this.render();
    }

    // ----- private rendering -----

    private render(): void {
        const root = this.contentEl;
        root.empty();
        root.addClass("checklist-sidebar-root");

        // Header
        const header = root.createDiv({ cls: "checklist-sidebar-header" });
        const newBtn = header.createEl("button", {
            text: "+ New list",
            cls: "checklist-new-list",
            attr: { type: "button" },
        });
        newBtn.addEventListener("click", () => {
            this.deps.openCreateListModal();
        });

        // Definition rows
        const defs = this.deps.getDefinitions();
        if (defs.length === 0) {
            root.createDiv({
                cls: "checklist-sidebar-empty",
                text: "No checklists yet. Click '+ New list' to create one.",
            });
            return;
        }

        const listEl = root.createDiv({ cls: "checklist-sidebar-list" });
        for (const def of defs) {
            this.renderRow(listEl, def);
        }
    }

    private renderRow(container: HTMLElement, def: ChecklistDefinition): void {
        const row = container.createDiv({ cls: "checklist-sidebar-row" });

        // Name button — opens main view for this list.
        const nameBtn = row.createEl("button", {
            cls: "checklist-sidebar-name",
            attr: { type: "button" },
        });
        // textContent only — never innerHTML — to prevent XSS from file names.
        nameBtn.textContent = def.name;
        nameBtn.addEventListener("click", () => {
            void this.deps.onSelectList(def.id);
        });

        // Edit button — opens the EditListModal.
        const editBtn = row.createEl("button", {
            text: "Edit",
            cls: "checklist-sidebar-edit",
            attr: { type: "button", "aria-label": `Edit ${def.name}` },
        });
        editBtn.addEventListener("click", () => {
            this.deps.openEditListModal(def);
        });

        // Delete button — opens an inline confirmation modal.
        const deleteBtn = row.createEl("button", {
            text: "Delete",
            cls: "checklist-sidebar-delete",
            attr: { type: "button", "aria-label": `Delete ${def.name}` },
        });
        deleteBtn.addEventListener("click", () => {
            const modal = new ConfirmDeleteModal(
                this.app,
                def,
                () => this.deps.onDeleteList(def.id)
            );
            modal.open();
        });
    }
}
