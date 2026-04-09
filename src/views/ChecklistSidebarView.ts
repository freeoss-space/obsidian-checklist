import { ItemView, WorkspaceLeaf, setIcon, Menu } from "obsidian";
import { VIEW_TYPE_CHECKLIST_SIDEBAR, ICON_CHECKLIST } from "../constants";
import { ChecklistManager } from "../services/ChecklistManager";
import { ChecklistDefinition } from "../models/types";

/**
 * Sidebar view that displays checklists as a nav tree.
 * Uses Obsidian's native view-header actions and tree-item patterns
 * for consistent styling with the built-in file explorer.
 * Clicking a checklist opens the main ChecklistView with its items.
 */
export class ChecklistSidebarView extends ItemView {
    private manager: ChecklistManager;
    private listContainer: HTMLElement;
    private onSelectChecklist: (id: string) => void;
    private onCreateList: () => void;
    private onDeleteChecklist: (id: string) => void;
    private onExport: (id: string | null, format: "markdown" | "json") => void;

    constructor(
        leaf: WorkspaceLeaf,
        manager: ChecklistManager,
        onSelectChecklist: (id: string) => void,
        onCreateList: () => void,
        onDeleteChecklist: (id: string) => void,
        onExport: (id: string | null, format: "markdown" | "json") => void
    ) {
        super(leaf);
        this.manager = manager;
        this.onSelectChecklist = onSelectChecklist;
        this.onCreateList = onCreateList;
        this.onDeleteChecklist = onDeleteChecklist;
        this.onExport = onExport;
        this.listContainer = document.createElement("div");
    }

    getViewType(): string {
        return VIEW_TYPE_CHECKLIST_SIDEBAR;
    }

    getDisplayText(): string {
        return "Checklists";
    }

    getIcon(): string {
        return ICON_CHECKLIST;
    }

    async onOpen(): Promise<void> {
        // Action buttons in native view-header (shown on hover)
        this.addAction("download", "Export all checklists", (e) => {
            const menu = new Menu();
            menu.addItem((item) => {
                item.setTitle("Export all as Markdown")
                    .setIcon("file-text")
                    .onClick(() => this.onExport(null, "markdown"));
            });
            menu.addItem((item) => {
                item.setTitle("Export all as JSON")
                    .setIcon("braces")
                    .onClick(() => this.onExport(null, "json"));
            });
            menu.showAtMouseEvent(e as MouseEvent);
        });

        this.addAction("plus", "New checklist", () => {
            this.onCreateList();
        });

        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass("nav-files-container", "checklist-sidebar-container");

        // Always-visible nav-header button (mirrors Obsidian's File Explorer pattern)
        const navHeader = container.createDiv({ cls: "nav-header" });
        const navButtons = navHeader.createDiv({ cls: "nav-buttons-container" });
        const newBtn = navButtons.createEl("div", {
            cls: "nav-action-button clickable-icon",
            attr: { "aria-label": "New checklist" },
        });
        setIcon(newBtn, "plus");
        newBtn.addEventListener("click", () => this.onCreateList());

        this.listContainer = container.createDiv({ cls: "nav-folder-children" });

        await this.renderView();
    }

    async onClose(): Promise<void> {
        this.listContainer.empty();
    }

    async renderView(): Promise<void> {
        this.listContainer.empty();

        const checklists = this.manager.getSettings().checklists;
        const activeId = this.manager.getSettings().activeChecklistId;

        if (checklists.length === 0) {
            const empty = this.listContainer.createDiv({ cls: "checklist-sidebar-empty" });
            empty.createEl("p", { text: "No checklists yet." });
            return;
        }

        for (const checklist of checklists) {
            this.renderChecklistEntry(this.listContainer, checklist, checklist.id === activeId);
        }
    }

    private renderChecklistEntry(
        container: HTMLElement,
        checklist: ChecklistDefinition,
        isActive: boolean
    ): void {
        const item = container.createDiv({ cls: "tree-item nav-file" });
        const self = item.createDiv({
            cls: `tree-item-self nav-file-title${isActive ? " is-active" : ""}`,
            attr: { "data-path": checklist.id },
        });

        const iconEl = self.createSpan({ cls: "tree-item-icon nav-file-title-icon" });
        setIcon(iconEl, ICON_CHECKLIST);

        self.createSpan({
            text: checklist.name,
            cls: "tree-item-inner nav-file-title-content",
        });

        const countEl = self.createSpan({ cls: "tree-item-flair" });
        this.manager.getItems(checklist.id).then((items) => {
            countEl.setText(String(items.length));
        });

        self.addEventListener("click", () => {
            this.onSelectChecklist(checklist.id);
        });

        self.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            const menu = new Menu();
            menu.addItem((menuItem) => {
                menuItem.setTitle("Export as Markdown")
                    .setIcon("file-text")
                    .onClick(() => this.onExport(checklist.id, "markdown"));
            });
            menu.addItem((menuItem) => {
                menuItem.setTitle("Export as JSON")
                    .setIcon("braces")
                    .onClick(() => this.onExport(checklist.id, "json"));
            });
            menu.addItem((menuItem) => {
                menuItem.setTitle("Delete checklist")
                    .setIcon("trash")
                    .onClick(() => this.onDeleteChecklist(checklist.id));
            });
            menu.showAtMouseEvent(e);
        });
    }
}
