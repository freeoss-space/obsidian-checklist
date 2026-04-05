import { ItemView, WorkspaceLeaf, setIcon, Menu } from "obsidian";
import { VIEW_TYPE_CHECKLIST_SIDEBAR, ICON_CHECKLIST } from "../constants";
import { ChecklistManager } from "../services/ChecklistManager";
import { ChecklistDefinition } from "../models/types";

/**
 * Sidebar view that displays checklists as a folder tree.
 * Clicking a checklist opens the main ChecklistView with its items.
 */
export class ChecklistSidebarView extends ItemView {
    private manager: ChecklistManager;
    private contentContainer: HTMLElement;
    private onSelectChecklist: (id: string) => void;
    private onCreateList: () => void;
    private onDeleteChecklist: (id: string) => void;

    constructor(
        leaf: WorkspaceLeaf,
        manager: ChecklistManager,
        onSelectChecklist: (id: string) => void,
        onCreateList: () => void,
        onDeleteChecklist: (id: string) => void
    ) {
        super(leaf);
        this.manager = manager;
        this.onSelectChecklist = onSelectChecklist;
        this.onCreateList = onCreateList;
        this.onDeleteChecklist = onDeleteChecklist;
        this.contentContainer = document.createElement("div");
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
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass("checklist-sidebar-container");

        this.contentContainer = container.createDiv({ cls: "checklist-sidebar-content" });

        await this.renderView();
    }

    async onClose(): Promise<void> {
        this.contentContainer.empty();
    }

    async renderView(): Promise<void> {
        this.contentContainer.empty();

        // Header with create button
        const header = this.contentContainer.createDiv({ cls: "checklist-sidebar-header" });
        header.createSpan({ text: "Checklists", cls: "checklist-sidebar-title" });
        const addBtn = header.createEl("button", {
            cls: "checklist-sidebar-add-btn clickable-icon",
            attr: { "aria-label": "New checklist" },
        });
        setIcon(addBtn, "plus");
        addBtn.addEventListener("click", () => this.onCreateList());

        const checklists = this.manager.getSettings().checklists;
        const activeId = this.manager.getSettings().activeChecklistId;

        if (checklists.length === 0) {
            const empty = this.contentContainer.createDiv({ cls: "checklist-sidebar-empty" });
            empty.createEl("p", { text: "No checklists yet." });
            return;
        }

        // Checklist list
        const list = this.contentContainer.createDiv({ cls: "checklist-sidebar-list" });
        for (const checklist of checklists) {
            this.renderChecklistEntry(list, checklist, checklist.id === activeId);
        }
    }

    private renderChecklistEntry(
        container: HTMLElement,
        checklist: ChecklistDefinition,
        isActive: boolean
    ): void {
        const entry = container.createDiv({
            cls: `checklist-sidebar-entry${isActive ? " is-active" : ""}`,
        });

        const iconEl = entry.createSpan({ cls: "checklist-sidebar-entry-icon" });
        setIcon(iconEl, ICON_CHECKLIST);

        entry.createSpan({
            text: checklist.name,
            cls: "checklist-sidebar-entry-name",
        });

        const countEl = entry.createSpan({ cls: "checklist-sidebar-entry-count" });
        // Load count async
        this.manager.getItems(checklist.id).then((items) => {
            countEl.setText(String(items.length));
        });

        entry.addEventListener("click", () => {
            this.onSelectChecklist(checklist.id);
        });

        entry.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            const menu = new Menu();
            menu.addItem((item) => {
                item.setTitle("Delete checklist")
                    .setIcon("trash")
                    .onClick(() => {
                        this.onDeleteChecklist(checklist.id);
                    });
            });
            menu.showAtMouseEvent(e);
        });
    }
}
