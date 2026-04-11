import { ItemView, WorkspaceLeaf, setIcon, Menu } from "obsidian";
import { VIEW_TYPE_CHECKLIST, ICON_CHECKLIST } from "../constants";
import { ChecklistManager } from "../services/ChecklistManager";
import { ChecklistItem, ChecklistDefinition } from "../models/types";
import { applyView, ViewState } from "../utils/applyView";
import { SortDir } from "../utils/sort";
import { StatusFilter } from "../utils/filter";

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
    private inlineDraftByChecklist: Map<
        string,
        { name: string; description: string; properties: Record<string, string> }
    > = new Map();
    /** Per-checklist view state (sort + filter), kept in-memory only. */
    private viewStateByChecklist: Map<string, ViewState> = new Map();

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
        if (typeof (this as any).setTitle === "function") {
            (this as any).setTitle(checklist.name);
        }
        // Title bar
        const titleBar = this.contentContainer.createDiv({ cls: "checklist-title-bar" });
        titleBar.createEl("h4", { text: checklist.name, cls: "checklist-title" });
        const addBtn = titleBar.createEl("button", {
            cls: "checklist-add-btn clickable-icon",
            attr: { "aria-label": "Add item" },
        });
        setIcon(addBtn, "plus");
        addBtn.addEventListener("click", () => this.onAddItem());

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

        const allItems = await this.manager.getItems(checklist.id);
        const state = this.getViewState(checklist.id);

        // Toolbar (search + status filter)
        this.renderToolbar(checklist, state);

        const items = applyView(allItems, state);
        const listContainer = this.contentContainer.createDiv({ cls: "checklist-items" });

        if (allItems.length === 0) {
            listContainer.createEl("p", {
                text: "No items yet. Add one to get started!",
                cls: "checklist-no-items",
            });
        } else {
            // Column headers (sortable)
            const headerRow = listContainer.createDiv({ cls: "checklist-header-row" });
            if (checklist.kind !== "list") {
                headerRow.createDiv({ cls: "checklist-col checklist-col-check", text: "" });
            }
            this.renderSortableHeader(
                headerRow,
                "checklist-col-name",
                "Name",
                "name",
                checklist.id,
                state
            );
            for (const prop of checklist.properties) {
                this.renderSortableHeader(
                    headerRow,
                    "checklist-col-prop",
                    prop.name,
                    prop.name,
                    checklist.id,
                    state
                );
            }
            headerRow.createDiv({ cls: "checklist-col checklist-col-actions", text: "" });

            if (items.length === 0) {
                listContainer.createEl("p", {
                    text: "No items match the current filters.",
                    cls: "checklist-no-items",
                });
            } else {
                for (const item of items) {
                    this.renderItem(listContainer, item, checklist);
                }
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

        // Checkbox (only for checklist kind)
        if (checklist.kind !== "list") {
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
        }

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

    private getViewState(checklistId: string): ViewState {
        let state = this.viewStateByChecklist.get(checklistId);
        if (!state) {
            state = { filter: { query: "", status: "all" } };
            this.viewStateByChecklist.set(checklistId, state);
        }
        return state;
    }

    private renderToolbar(checklist: ChecklistDefinition, state: ViewState): void {
        const toolbar = this.contentContainer.createDiv({ cls: "checklist-toolbar" });

        const search = toolbar.createEl("input", {
            type: "text",
            cls: "checklist-toolbar-search",
            attr: { placeholder: "Search items...", "aria-label": "Search items" },
        });
        search.value = state.filter?.query ?? "";
        search.addEventListener("input", async () => {
            state.filter = { ...(state.filter ?? {}), query: search.value };
            await this.renderView();
            const next = this.contentContainer.querySelector(
                ".checklist-toolbar-search"
            ) as HTMLInputElement | null;
            if (next) {
                next.focus();
                next.setSelectionRange(next.value.length, next.value.length);
            }
        });

        const statusSelect = toolbar.createEl("select", {
            cls: "checklist-toolbar-status",
            attr: { "aria-label": "Status filter" },
        });
        for (const opt of [
            { v: "all", label: "All" },
            { v: "active", label: "Active" },
            { v: "done", label: "Done" },
        ]) {
            const optEl = statusSelect.createEl("option", { text: opt.label });
            optEl.value = opt.v;
        }
        statusSelect.value = state.filter?.status ?? "all";
        statusSelect.addEventListener("change", async () => {
            state.filter = {
                ...(state.filter ?? {}),
                status: statusSelect.value as StatusFilter,
            };
            await this.renderView();
        });

        const clearBtn = toolbar.createEl("button", {
            cls: "checklist-toolbar-clear",
            text: "Clear",
            attr: { "aria-label": "Clear filters and sort" },
        });
        clearBtn.addEventListener("click", async () => {
            this.viewStateByChecklist.set(checklist.id, {
                filter: { query: "", status: "all" },
            });
            await this.renderView();
        });
    }

    private renderSortableHeader(
        parent: HTMLElement,
        colCls: string,
        label: string,
        key: string,
        checklistId: string,
        state: ViewState
    ): void {
        const cell = parent.createDiv({
            cls: `checklist-col ${colCls} checklist-col-sortable`,
        });
        cell.createSpan({ text: label });
        const isActive = state.sort?.key === key;
        const indicator = cell.createSpan({ cls: "checklist-sort-indicator" });
        indicator.textContent = isActive ? (state.sort?.dir === "desc" ? " ↓" : " ↑") : "";
        cell.addEventListener("click", async () => {
            const current = state.sort;
            let nextDir: SortDir = "asc";
            if (current?.key === key) {
                nextDir = current.dir === "asc" ? "desc" : "asc";
            }
            state.sort = { key, dir: nextDir };
            this.viewStateByChecklist.set(checklistId, state);
            await this.renderView();
        });
    }

    private renderInlineAdd(container: HTMLElement, checklist: ChecklistDefinition): void {
        const inlineRow = container.createDiv({ cls: "checklist-inline-add" });
        const iconEl = inlineRow.createSpan({ cls: "checklist-inline-add-icon" });
        setIcon(iconEl, "plus");

        const draft = this.getInlineDraft(checklist.id);
        const isFormMode = checklist.inlineAddMode === "form" || checklist.properties.length > 0;

        const input = inlineRow.createEl("input", {
            type: "text",
            cls: "checklist-inline-add-input",
            attr: { placeholder: "Add new item..." },
        });
        input.value = draft.name;
        input.addEventListener("input", () => {
            draft.name = input.value;
        });

        const properties: Record<string, string> = { ...draft.properties };
        let descriptionValue = draft.description;

        if (isFormMode) {
            inlineRow.addClass("checklist-inline-add-form");
            const descInput = inlineRow.createEl("input", {
                type: "text",
                cls: "checklist-inline-add-input checklist-inline-add-desc",
                attr: { placeholder: "Description (optional)" },
            });
            descInput.value = draft.description;
            descInput.addEventListener("input", () => {
                descriptionValue = descInput.value;
                draft.description = descriptionValue;
            });

            for (const prop of checklist.properties) {
                const propInput = inlineRow.createEl("input", {
                    type: "text",
                    cls: "checklist-inline-add-input checklist-inline-add-prop",
                    attr: { placeholder: prop.name },
                });
                const prev = draft.properties[prop.name];
                propInput.value = prev ?? (prop.defaultValue ? String(prop.defaultValue) : "");
                properties[prop.name] = propInput.value;
                propInput.addEventListener("input", () => {
                    properties[prop.name] = propInput.value;
                    draft.properties[prop.name] = propInput.value;
                });
            }
        }

        const addInline = async () => {
            if (!input.value.trim()) return;
            await this.manager.addItem(checklist.id, input.value.trim(), properties, descriptionValue.trim());
            this.inlineDraftByChecklist.set(checklist.id, { name: "", description: "", properties: {} });
            await this.renderView();
            this.onRefreshSidebar();
            const next = this.contentContainer.querySelector(
                ".checklist-inline-add-input"
            ) as HTMLInputElement | null;
            next?.focus();
        };

        input.addEventListener("keydown", async (e) => {
            if (e.key === "Enter") {
                await addInline();
            }
        });
    }

    private getInlineDraft(
        checklistId: string
    ): { name: string; description: string; properties: Record<string, string> } {
        let draft = this.inlineDraftByChecklist.get(checklistId);
        if (!draft) {
            draft = { name: "", description: "", properties: {} };
            this.inlineDraftByChecklist.set(checklistId, draft);
        }
        return draft;
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
