import { Plugin, WorkspaceLeaf, Notice } from "obsidian";
import { VIEW_TYPE_CHECKLIST, VIEW_TYPE_CHECKLIST_SIDEBAR, ICON_CHECKLIST } from "./constants";
import { ChecklistView } from "./views/ChecklistView";
import { ChecklistSidebarView } from "./views/ChecklistSidebarView";
import { ChecklistManager } from "./services/ChecklistManager";
import { CreateListModal } from "./modals/CreateListModal";
import { AddItemModal } from "./modals/AddItemModal";
import { AddItemsModal } from "./modals/AddItemsModal";
import {
    ChecklistPluginSettings,
    DEFAULT_SETTINGS,
} from "./models/types";

export default class ChecklistPlugin extends Plugin {
    settings: ChecklistPluginSettings = DEFAULT_SETTINGS;
    manager: ChecklistManager;

    async onload(): Promise<void> {
        await this.loadSettings();

        this.manager = new ChecklistManager(this.app, this.settings, () =>
            this.saveSettings()
        );

        // Sidebar view (left) - shows checklist folders
        this.registerView(VIEW_TYPE_CHECKLIST_SIDEBAR, (leaf: WorkspaceLeaf) => {
            return new ChecklistSidebarView(
                leaf,
                this.manager,
                (id) => this.selectChecklist(id),
                () => this.openCreateListModal(),
                (id) => this.handleDeleteChecklist(id),
                (id, format) => this.handleExport(id, format)
            );
        });

        // Main content view - shows items for selected checklist
        this.registerView(VIEW_TYPE_CHECKLIST, (leaf: WorkspaceLeaf) => {
            return new ChecklistView(
                leaf,
                this.manager,
                () => this.openAddItemModal(),
                () => this.openAddItemsModal(),
                (filePath) => this.handleDeleteItem(filePath),
                () => this.refreshSidebar(),
                (format) => {
                    const active = this.manager.getActiveChecklist();
                    if (active) this.handleExport(active.id, format);
                }
            );
        });

        // Ribbon icon opens the sidebar
        this.addRibbonIcon(ICON_CHECKLIST, "Open Checklist", () => {
            this.activateSidebar();
        });

        // Auto-activate sidebar views on layout ready
        this.app.workspace.onLayoutReady(() => {
            this.activateSidebar();
        });

        // Commands
        this.addCommand({
            id: "open-checklist-sidebar",
            name: "Open checklist sidebar",
            callback: () => this.activateSidebar(),
        });

        this.addCommand({
            id: "open-checklist-view",
            name: "Open checklist view",
            callback: () => this.activateMainView(),
        });

        this.addCommand({
            id: "create-new-checklist",
            name: "Create new checklist",
            callback: () => this.openCreateListModal(),
        });

        this.addCommand({
            id: "add-checklist-item",
            name: "Add item to active checklist",
            callback: () => this.openAddItemModal(),
        });

        this.addCommand({
            id: "add-checklist-items",
            name: "Add multiple items to active checklist",
            callback: () => this.openAddItemsModal(),
        });

        this.addCommand({
            id: "export-checklist-markdown",
            name: "Export active checklist as Markdown",
            callback: () => {
                const active = this.manager.getActiveChecklist();
                if (active) this.handleExport(active.id, "markdown");
                else new Notice("No active checklist.");
            },
        });

        this.addCommand({
            id: "export-checklist-json",
            name: "Export active checklist as JSON",
            callback: () => {
                const active = this.manager.getActiveChecklist();
                if (active) this.handleExport(active.id, "json");
                else new Notice("No active checklist.");
            },
        });

        this.addCommand({
            id: "export-all-checklists-markdown",
            name: "Export all checklists as Markdown",
            callback: () => this.handleExport(null, "markdown"),
        });

        this.addCommand({
            id: "export-all-checklists-json",
            name: "Export all checklists as JSON",
            callback: () => this.handleExport(null, "json"),
        });
    }

    onunload(): void {
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_CHECKLIST);
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_CHECKLIST_SIDEBAR);
    }

    /**
     * Opens the sidebar in the left panel.
     */
    async activateSidebar(): Promise<void> {
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHECKLIST_SIDEBAR);

        if (leaves.length > 0) {
            this.app.workspace.revealLeaf(leaves[0]);
            return;
        }

        const leaf = this.app.workspace.getLeftLeaf(false);
        if (leaf) {
            await leaf.setViewState({
                type: VIEW_TYPE_CHECKLIST_SIDEBAR,
                active: true,
            });
            this.app.workspace.revealLeaf(leaf);
        }
    }

    /**
     * Opens the main checklist view.
     */
    async activateMainView(): Promise<void> {
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHECKLIST);

        if (leaves.length > 0) {
            this.app.workspace.revealLeaf(leaves[0]);
            return;
        }

        const leaf = this.app.workspace.getLeftLeaf(false);
        if (leaf) {
            await leaf.setViewState({
                type: VIEW_TYPE_CHECKLIST,
                active: true,
            });
            this.app.workspace.revealLeaf(leaf);
        }
    }

    /**
     * Selects a checklist from the sidebar, sets it active, and opens the main view.
     */
    async selectChecklist(id: string): Promise<void> {
        this.manager.setActiveChecklist(id);
        await this.activateMainView();
        this.refreshMainView();
        this.refreshSidebar();
    }

    /**
     * Handles checklist deletion with confirmation.
     */
    async handleDeleteChecklist(id: string): Promise<void> {
        const checklist = this.manager.getSettings().checklists.find((c) => c.id === id);
        if (!checklist) return;

        await this.manager.deleteChecklist(id);
        new Notice(`Checklist "${checklist.name}" deleted.`);
        this.refreshSidebar();
        this.refreshMainView();
    }

    /**
     * Handles item deletion.
     */
    async handleDeleteItem(filePath: string): Promise<void> {
        await this.manager.deleteItem(filePath);
        const name = filePath.split("/").pop()?.replace(/\.md$/, "") || "Item";
        new Notice(`"${name}" deleted.`);
        this.refreshMainView();
        this.refreshSidebar();
    }

    /**
     * Exports a checklist (or all checklists) and saves to vault.
     */
    async handleExport(id: string | null, format: "markdown" | "json"): Promise<void> {
        const ext = format === "markdown" ? "md" : "json";

        if (id === null) {
            // Export all
            const content = format === "markdown"
                ? await this.manager.exportAllAsMarkdown()
                : await this.manager.exportAllAsJson();

            if (!content || content === "") {
                new Notice("No checklists to export.");
                return;
            }

            const filePath = `checklists-export.${ext}`;
            await this.saveExportFile(filePath, content);
            new Notice(`All checklists exported to ${filePath}`);
        } else {
            // Export single
            const checklist = this.manager.getSettings().checklists.find((c) => c.id === id);
            if (!checklist) return;

            const content = format === "markdown"
                ? await this.manager.exportChecklistAsMarkdown(id)
                : await this.manager.exportChecklistAsJson(id);

            const safeName = checklist.name.replace(/[\\/:*?"<>|]/g, "-");
            const filePath = `${safeName}-export.${ext}`;
            await this.saveExportFile(filePath, content);
            new Notice(`"${checklist.name}" exported to ${filePath}`);
        }
    }

    private async saveExportFile(filePath: string, content: string): Promise<void> {
        const existing = this.app.vault.getAbstractFileByPath(filePath);
        if (existing) {
            await this.app.vault.modify(existing as any, content);
        } else {
            await this.app.vault.create(filePath, content);
        }
    }

    openCreateListModal(): void {
        new CreateListModal(this.app, async (name, properties) => {
            await this.manager.createChecklist(name, properties);
            new Notice(`Checklist "${name}" created.`);
            this.refreshSidebar();
            await this.activateMainView();
            this.refreshMainView();
        }).open();
    }

    openAddItemModal(): void {
        const active = this.manager.getActiveChecklist();
        if (!active) {
            new Notice("No active checklist. Create one first.");
            return;
        }

        new AddItemModal(
            this.app,
            active.properties,
            async (name, properties, description) => {
                await this.manager.addItem(active.id, name, properties, description);
                new Notice(`Item "${name}" added.`);
                this.refreshMainView();
                this.refreshSidebar();
            }
        ).open();
    }

    openAddItemsModal(): void {
        const active = this.manager.getActiveChecklist();
        if (!active) {
            new Notice("No active checklist. Create one first.");
            return;
        }

        new AddItemsModal(
            this.app,
            active.properties,
            async (items) => {
                const files = await this.manager.addItems(active.id, items);
                new Notice(`${files.length} item(s) added.`);
                this.refreshMainView();
                this.refreshSidebar();
            }
        ).open();
    }

    private refreshMainView(): void {
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHECKLIST);
        for (const leaf of leaves) {
            const view = leaf.view;
            if (view instanceof ChecklistView) {
                view.renderView();
            }
        }
    }

    private refreshSidebar(): void {
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHECKLIST_SIDEBAR);
        for (const leaf of leaves) {
            const view = leaf.view;
            if (view instanceof ChecklistSidebarView) {
                view.renderView();
            }
        }
    }

    async loadSettings(): Promise<void> {
        const data = await this.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }
}
