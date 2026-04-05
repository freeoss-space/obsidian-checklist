import { ItemView, WorkspaceLeaf, setIcon, Menu } from "obsidian";
import { VIEW_TYPE_CHECKLIST, ICON_CHECKLIST } from "../constants";
import { ChecklistManager } from "../services/ChecklistManager";
import { ChecklistItem, ChecklistDefinition } from "../models/types";

/**
 * Main content view that displays items for the active checklist.
 * Features inline add, delete via context menu, and a floating action button.
 */
export class ChecklistView extends ItemView {
    private manager: ChecklistManager;
    private contentContainer: HTMLElement;
    private onAddItem: () => void;
    private onAddItems: () => void;
    private onDeleteItem: (filePath: string) => void;
    private onRefreshSidebar: () => void;
    private onExport: (format: "markdown" | "json") => void;

    constructor(
        leaf: WorkspaceLeaf,
        manager: ChecklistManager,
        onAddItem: () => void,
        onAddItems: () => void,
        onDeleteItem: (filePath: string) => void,
        onRefreshSidebar: () => void,
        onExport: (format: "markdown" | "json") => void
    ) {
        super(leaf);
        this.manager = manager;
        this.onAddItem = onAddItem;
        this.onAddItems = onAddItems;
        this.onDeleteItem = onDeleteItem;
        this.onRefreshSidebar = onRefreshSidebar;
        this.onExport = onExport;
        this.contentContainer = document.createElement("div");
    }

    getViewType(): string {
        return VIEW_TYPE_CHECKLIST;
    }

    getDisplayText(): string {
        const active = this.manager.getActiveChecklist();
        return active ? active.name : "Checklist";
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

    async renderView(): Promise<void> {
        this.contentContainer.empty();

        const activeChecklist = this.manager.getActiveChecklist();

        if (!activeChecklist) {
            this.renderEmptyState();
            return;
        }

        await this.renderItems(activeChecklist);
        this.renderFAB();
    }

    private renderEmptyState(): void {
        const emptyDiv = this.contentContainer.createDiv({ cls: "checklist-empty" });
        emptyDiv.createEl("p", {
            text: "Select a checklist from the sidebar to view items.",
            cls: "checklist-empty-text",
        });
    }

    private async renderItems(checklist: ChecklistDefinition): Promise<void> {
        // Title bar
        const titleBar = this.contentContainer.createDiv({ cls: "checklist-title-bar" });
        titleBar.createEl("h4", { text: checklist.name, cls: "checklist-title" });

        const exportBtn = titleBar.createEl("button", {
            cls: "checklist-export-btn clickable-icon",
            attr: { "aria-label": "Export checklist" },
        });
        setIcon(exportBtn, "download");
        exportBtn.addEventListener("click", (e) => {
            const menu = new Menu();
            menu.addItem((item) => {
                item.setTitle("Export as Markdown")
                    .setIcon("file-text")
                    .onClick(() => this.onExport("markdown"));
            });
            menu.addItem((item) => {
                item.setTitle("Export as JSON")
                    .setIcon("braces")
                    .onClick(() => this.onExport("json"));
            });
            menu.showAtMouseEvent(e);
        });

        const items = await this.manager.getItems(checklist.id);
        const listContainer = this.contentContainer.createDiv({ cls: "checklist-items" });

        if (items.length === 0) {
            listContainer.createEl("p", {
                text: "No items yet. Add one to get started!",
                cls: "checklist-no-items",
            });
        } else {
            // Column headers
            const headerRow = listContainer.createDiv({ cls: "checklist-header-row" });
            headerRow.createDiv({ cls: "checklist-col checklist-col-check", text: "" });
            headerRow.createDiv({ cls: "checklist-col checklist-col-name", text: "Name" });
            for (const prop of checklist.properties) {
                headerRow.createDiv({ cls: "checklist-col checklist-col-prop", text: prop.name });
            }
            headerRow.createDiv({ cls: "checklist-col checklist-col-actions", text: "" });

            for (const item of items) {
                this.renderItem(listContainer, item, checklist);
            }
        }

        // Inline add row
        this.renderInlineAdd(listContainer, checklist);
    }

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
                setTimeout(async () => {
                    await this.manager.completeItem(item.filePath);
                    await this.renderView();
                    this.onRefreshSidebar();
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

        // Delete button
        const actionsCell = row.createDiv({ cls: "checklist-col checklist-col-actions" });
        const deleteBtn = actionsCell.createEl("button", {
            cls: "checklist-item-delete clickable-icon",
            attr: { "aria-label": "Delete item" },
        });
        setIcon(deleteBtn, "trash-2");
        deleteBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.onDeleteItem(item.filePath);
        });

        // Context menu
        row.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            const menu = new Menu();
            menu.addItem((menuItem) => {
                menuItem
                    .setTitle("Delete item")
                    .setIcon("trash-2")
                    .onClick(() => this.onDeleteItem(item.filePath));
            });
            menu.showAtMouseEvent(e);
        });
    }

    private renderInlineAdd(container: HTMLElement, checklist: ChecklistDefinition): void {
        const inlineRow = container.createDiv({ cls: "checklist-inline-add" });
        const iconEl = inlineRow.createSpan({ cls: "checklist-inline-add-icon" });
        setIcon(iconEl, "plus");

        const input = inlineRow.createEl("input", {
            type: "text",
            cls: "checklist-inline-add-input",
            attr: { placeholder: "Add new item..." },
        });

        input.addEventListener("keydown", async (e) => {
            if (e.key === "Enter" && input.value.trim()) {
                const name = input.value.trim();
                await this.manager.addItem(checklist.id, name, {}, "");
                input.value = "";
                await this.renderView();
                this.onRefreshSidebar();
            }
        });
    }

    private renderFAB(): void {
        const fab = this.contentContainer.createDiv({ cls: "checklist-fab" });

        // Main FAB button
        const mainBtn = fab.createEl("button", {
            cls: "checklist-fab-main",
            attr: { "aria-label": "Add items" },
        });
        setIcon(mainBtn, "plus");

        // Expandable menu
        const fabMenu = fab.createDiv({ cls: "checklist-fab-menu" });

        const addOneBtn = fabMenu.createEl("button", {
            cls: "checklist-fab-option",
            attr: { "aria-label": "Add single item" },
        });
        setIcon(addOneBtn, "plus");
        addOneBtn.createSpan({ text: "Add Item" });
        addOneBtn.addEventListener("click", () => {
            fab.removeClass("is-open");
            this.onAddItem();
        });

        const addMultiBtn = fabMenu.createEl("button", {
            cls: "checklist-fab-option",
            attr: { "aria-label": "Add multiple items" },
        });
        setIcon(addMultiBtn, "list-plus");
        addMultiBtn.createSpan({ text: "Add Multiple" });
        addMultiBtn.addEventListener("click", () => {
            fab.removeClass("is-open");
            this.onAddItems();
        });

        mainBtn.addEventListener("click", () => {
            fab.toggleClass("is-open", !fab.hasClass("is-open"));
        });
    }
}
