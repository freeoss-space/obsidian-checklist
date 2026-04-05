import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import { VIEW_TYPE_CHECKLIST, ICON_CHECKLIST } from "../constants";
import { ChecklistManager } from "../services/ChecklistManager";
import { ChecklistItem, ChecklistDefinition } from "../models/types";

/**
 * Sidebar view that displays a checklist with checkboxes.
 * Completed items are removed from the list (file deleted).
 */
export class ChecklistView extends ItemView {
    private manager: ChecklistManager;
    private contentContainer: HTMLElement;
    private onCreateList: () => void;
    private onAddItem: () => void;
    private onAddItems: () => void;

    constructor(
        leaf: WorkspaceLeaf,
        manager: ChecklistManager,
        onCreateList: () => void,
        onAddItem: () => void,
        onAddItems: () => void
    ) {
        super(leaf);
        this.manager = manager;
        this.onCreateList = onCreateList;
        this.onAddItem = onAddItem;
        this.onAddItems = onAddItems;
        this.contentContainer = document.createElement("div");
    }

    getViewType(): string {
        return VIEW_TYPE_CHECKLIST;
    }

    getDisplayText(): string {
        return "Checklist";
    }

    getIcon(): string {
        return ICON_CHECKLIST;
    }

    async onOpen(): Promise<void> {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass("checklist-view-container");

        this.contentContainer = container.createDiv({ cls: "checklist-content" });

        await this.renderView();
    }

    async onClose(): Promise<void> {
        this.contentContainer.empty();
    }

    /**
     * Full re-render of the view.
     */
    async renderView(): Promise<void> {
        this.contentContainer.empty();

        const activeChecklist = this.manager.getActiveChecklist();

        this.renderToolbar(activeChecklist);

        if (!activeChecklist) {
            this.renderEmptyState();
            return;
        }

        await this.renderItems(activeChecklist);
    }

    /**
     * Renders the top toolbar with checklist selector and action buttons.
     */
    private renderToolbar(activeChecklist: ChecklistDefinition | null): void {
        const toolbar = this.contentContainer.createDiv({ cls: "checklist-toolbar" });

        // Checklist selector dropdown
        const checklists = this.manager.getSettings().checklists;
        if (checklists.length > 0) {
            const select = toolbar.createEl("select", { cls: "checklist-selector" });
            select.createEl("option", { text: "Select a checklist...", value: "" });

            for (const cl of checklists) {
                const opt = select.createEl("option", {
                    text: cl.name,
                    value: cl.id,
                });
                if (activeChecklist && cl.id === activeChecklist.id) {
                    opt.selected = true;
                }
            }

            select.addEventListener("change", () => {
                const id = select.value;
                if (id) {
                    this.manager.setActiveChecklist(id);
                }
                this.renderView();
            });
        }

        // Action buttons
        const actions = toolbar.createDiv({ cls: "checklist-actions" });

        const newListBtn = actions.createEl("button", {
            cls: "checklist-btn checklist-btn-new-list",
            attr: { "aria-label": "New checklist" },
        });
        setIcon(newListBtn, "plus-circle");
        newListBtn.createSpan({ text: "New List" });
        newListBtn.addEventListener("click", () => this.onCreateList());

        if (activeChecklist) {
            const addItemBtn = actions.createEl("button", {
                cls: "checklist-btn checklist-btn-add-item",
                attr: { "aria-label": "Add item" },
            });
            setIcon(addItemBtn, "plus");
            addItemBtn.createSpan({ text: "Add Item" });
            addItemBtn.addEventListener("click", () => this.onAddItem());

            const addItemsBtn = actions.createEl("button", {
                cls: "checklist-btn checklist-btn-add-items",
                attr: { "aria-label": "Add multiple items" },
            });
            setIcon(addItemsBtn, "list-plus");
            addItemsBtn.createSpan({ text: "Add Multiple" });
            addItemsBtn.addEventListener("click", () => this.onAddItems());
        }
    }

    /**
     * Renders an empty state message when no checklist is selected.
     */
    private renderEmptyState(): void {
        const emptyDiv = this.contentContainer.createDiv({ cls: "checklist-empty" });
        emptyDiv.createEl("p", {
            text: "No checklist selected. Create a new checklist to get started.",
            cls: "checklist-empty-text",
        });

        const createBtn = emptyDiv.createEl("button", {
            text: "Create Checklist",
            cls: "checklist-btn checklist-btn-create",
        });
        createBtn.addEventListener("click", () => this.onCreateList());
    }

    /**
     * Renders the list of items with checkboxes.
     */
    private async renderItems(checklist: ChecklistDefinition): Promise<void> {
        const items = await this.manager.getItems(checklist.id);
        const listContainer = this.contentContainer.createDiv({ cls: "checklist-items" });

        if (items.length === 0) {
            listContainer.createEl("p", {
                text: "No items yet. Add one to get started!",
                cls: "checklist-no-items",
            });
            return;
        }

        // Render column headers
        const headerRow = listContainer.createDiv({ cls: "checklist-header-row" });
        headerRow.createDiv({ cls: "checklist-col checklist-col-check", text: "" });
        headerRow.createDiv({ cls: "checklist-col checklist-col-name", text: "Name" });
        for (const prop of checklist.properties) {
            headerRow.createDiv({ cls: "checklist-col checklist-col-prop", text: prop.name });
        }

        // Render items
        for (const item of items) {
            this.renderItem(listContainer, item, checklist);
        }
    }

    /**
     * Renders a single checklist item row.
     */
    private renderItem(
        container: HTMLElement,
        item: ChecklistItem,
        checklist: ChecklistDefinition
    ): void {
        const row = container.createDiv({ cls: "checklist-item-row" });

        // Checkbox
        const checkCell = row.createDiv({ cls: "checklist-col checklist-col-check" });
        const checkbox = checkCell.createEl("input", { type: "checkbox" });
        checkbox.checked = item.completed;
        checkbox.addEventListener("change", async () => {
            if (checkbox.checked) {
                row.addClass("checklist-item-completing");
                // Brief delay for visual feedback
                setTimeout(async () => {
                    await this.manager.completeItem(item.filePath);
                    await this.renderView();
                }, 300);
            }
        });

        // Name
        const nameCell = row.createDiv({ cls: "checklist-col checklist-col-name" });
        nameCell.createSpan({ text: item.name, cls: "checklist-item-name" });
        if (item.description) {
            nameCell.createEl("small", {
                text: item.description,
                cls: "checklist-item-desc",
            });
        }

        // Properties
        for (const prop of checklist.properties) {
            const value = item.properties[prop.name] || "";
            row.createDiv({
                cls: "checklist-col checklist-col-prop",
                text: String(value),
            });
        }
    }
}
