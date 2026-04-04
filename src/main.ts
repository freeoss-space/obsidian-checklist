import { Plugin, WorkspaceLeaf, Notice } from "obsidian";
import { VIEW_TYPE_CHECKLIST, ICON_CHECKLIST } from "./constants";
import { ChecklistView } from "./views/ChecklistView";
import { ChecklistManager } from "./services/ChecklistManager";
import { CreateListModal } from "./modals/CreateListModal";
import { AddItemModal } from "./modals/AddItemModal";
import {
    ChecklistPluginSettings,
    DEFAULT_SETTINGS,
    PropertyDefinition,
} from "./models/types";

export default class ChecklistPlugin extends Plugin {
    settings: ChecklistPluginSettings = DEFAULT_SETTINGS;
    manager: ChecklistManager;

    async onload(): Promise<void> {
        await this.loadSettings();

        this.manager = new ChecklistManager(this.app, this.settings, () =>
            this.saveSettings()
        );

        this.registerView(VIEW_TYPE_CHECKLIST, (leaf: WorkspaceLeaf) => {
            return new ChecklistView(
                leaf,
                this.manager,
                () => this.openCreateListModal(),
                () => this.openAddItemModal()
            );
        });

        // Ribbon icon to open the checklist sidebar
        this.addRibbonIcon(ICON_CHECKLIST, "Open Checklist", () => {
            this.activateView();
        });

        // Commands
        this.addCommand({
            id: "open-checklist-view",
            name: "Open checklist view",
            callback: () => this.activateView(),
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
    }

    onunload(): void {
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_CHECKLIST);
    }

    /**
     * Opens the checklist view in the right sidebar.
     */
    async activateView(): Promise<void> {
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHECKLIST);

        if (leaves.length > 0) {
            this.app.workspace.revealLeaf(leaves[0]);
            return;
        }

        const leaf = this.app.workspace.getRightLeaf(false);
        if (leaf) {
            await leaf.setViewState({
                type: VIEW_TYPE_CHECKLIST,
                active: true,
            });
            this.app.workspace.revealLeaf(leaf);
        }
    }

    /**
     * Opens the create list modal.
     */
    openCreateListModal(): void {
        new CreateListModal(this.app, async (name, properties) => {
            await this.manager.createChecklist(name, properties);
            new Notice(`Checklist "${name}" created.`);
            this.refreshView();
        }).open();
    }

    /**
     * Opens the add item modal for the active checklist.
     */
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
                this.refreshView();
            }
        ).open();
    }

    /**
     * Triggers a re-render of any open checklist views.
     */
    private refreshView(): void {
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHECKLIST);
        for (const leaf of leaves) {
            const view = leaf.view;
            if (view instanceof ChecklistView) {
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
