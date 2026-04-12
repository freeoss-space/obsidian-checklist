import { Menu, Notice, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_CHECKLIST, VIEW_TYPE_CHECKLIST_MAIN } from "./constants";
import { ChecklistManager } from "./core/checklist-manager";
import { ChecklistSidebarView } from "./ui/sidebar-view";
import { ChecklistMainView } from "./ui/checklist-main-view";
import {
    CreateListModal,
    assertSafeFolder,
    normalizeFolder,
} from "./ui/create-list-modal";
import { EditListModal } from "./ui/edit-list-modal";
import { ChecklistSettingTab } from "./ui/settings-tab";
import { ShareToChecklistModal } from "./ui/share-to-checklist-modal";
import type { ChecklistDefinition } from "./core/types";

export interface ChecklistSettings {
    /** Settings schema version — bump when the shape changes. */
    settingsVersion: number;
    definitions: ChecklistDefinition[];
    /** Vault-relative default folder for newly created checklists. */
    defaultFolder: string;
}

const CURRENT_SETTINGS_VERSION = 2;

const DEFAULT_SETTINGS: ChecklistSettings = {
    settingsVersion: CURRENT_SETTINGS_VERSION,
    definitions: [],
    defaultFolder: "",
};

/**
 * Pure settings migration. Each case returns the next version's shape.
 * Keeping migrations pure means they're trivially unit testable.
 */
export function migrateSettings(raw: unknown): ChecklistSettings {
    if (raw === null || typeof raw !== "object") return { ...DEFAULT_SETTINGS };
    const obj = raw as Record<string, unknown>;
    const version = typeof obj.settingsVersion === "number" ? obj.settingsVersion : 0;
    let settings: ChecklistSettings = {
        settingsVersion: CURRENT_SETTINGS_VERSION,
        definitions: Array.isArray(obj.definitions) ? (obj.definitions as ChecklistDefinition[]) : [],
        defaultFolder:
            typeof obj.defaultFolder === "string" ? normalizeFolder(obj.defaultFolder) : "",
    };
    if (version < 1) {
        // No prior versions; seed with defaults.
        settings = { ...settings, settingsVersion: 1 };
    }
    if (settings.settingsVersion < 2) {
        // v2 introduced defaultFolder. Non-string values are coerced to "".
        settings = { ...settings, defaultFolder: settings.defaultFolder ?? "", settingsVersion: 2 };
    }
    // Belt-and-braces: if a persisted folder was tampered with on disk,
    // refuse to load it into memory. We'd rather start fresh than honor
    // a malicious path.
    try {
        assertSafeFolder(settings.defaultFolder);
    } catch {
        settings = { ...settings, defaultFolder: "" };
    }
    return settings;
}

export default class ChecklistPlugin extends Plugin {
    settings: ChecklistSettings = { ...DEFAULT_SETTINGS };
    manager!: ChecklistManager;

    async onload(): Promise<void> {
        await this.loadSettings();
        this.manager = new ChecklistManager(this.app);

        // Discover existing checklist folders that aren't yet in settings.
        const discovered = this.manager.discoverChecklists(
            this.settings.defaultFolder,
            this.settings.definitions
        );
        if (discovered.length > 0) {
            this.settings = {
                ...this.settings,
                definitions: [...this.settings.definitions, ...discovered],
            };
            await this.saveSettings();
        }

        // Sidebar view — list management (create, edit, delete, navigate).
        this.registerView(
            VIEW_TYPE_CHECKLIST,
            (leaf) =>
                new ChecklistSidebarView(leaf, {
                    getDefinitions: () => this.settings.definitions,
                    openCreateListModal: () => this.openCreateListModal(),
                    openEditListModal: (def) => this.openEditListModal(def),
                    onDeleteList: (id) => this.deleteList(id),
                    onSelectList: (id) => this.activateMainView(id),
                })
        );

        // Main view — item display for the active checklist.
        this.registerView(
            VIEW_TYPE_CHECKLIST_MAIN,
            (leaf) =>
                new ChecklistMainView(leaf, {
                    manager: this.manager,
                    getDefinitions: () => this.settings.definitions,
                    saveSettings: () => this.saveSettings(),
                    openAddItemModal: async (def) => this.quickAddItem(def),
                })
        );

        this.addRibbonIcon("check-square", "Checklists", async () => {
            await this.activateSidebarView();
        });

        this.addCommand({
            id: "checklist-open",
            name: "Open checklist sidebar",
            callback: async () => this.activateSidebarView(),
        });

        this.addCommand({
            id: "checklist-new-list",
            name: "Create new checklist",
            callback: () => this.openCreateListModal(),
        });

        this.addSettingTab(new ChecklistSettingTab(this.app, this));

        // Mobile share intent: let the user send shared text/URLs into a
        // checklist via the OS share sheet. Desktop has no such event,
        // so we skip registration there.
        this.registerShareIntentHandlers();

        // Incremental indexing. Subscribe to vault events and patch the cache.
        this.registerEvent(
            this.app.vault.on("create", (file) => this.handleVaultEvent("create", file))
        );
        this.registerEvent(
            this.app.vault.on("modify", (file) => this.handleVaultEvent("modify", file))
        );
        this.registerEvent(
            this.app.vault.on("delete", (file) => this.handleVaultEvent("delete", file))
        );
    }

    /**
     * Contribute an "Add to Checklist" entry to the mobile share-sheet
     * menu for both shared text and shared URLs.
     */
    private registerShareIntentHandlers(): void {
        const app = this.app as unknown as { isMobile?: boolean };
        if (!app.isMobile) return;

        const contribute = (menu: Menu, shared: string): void => {
            if (typeof shared !== "string") return;
            const capped = shared.slice(0, 10_000);
            menu.addItem((item) => {
                item.setTitle("Add to Checklist")
                    .setIcon("check-square")
                    .onClick(() => {
                        this.openShareModal(capped);
                    });
            });
        };

        const ws = this.app.workspace as unknown as {
            on: (name: string, cb: (menu: Menu, payload: string) => void) => unknown;
        };
        this.registerEvent(ws.on("receive-text-menu", contribute) as never);
        this.registerEvent(ws.on("receive-url-menu", contribute) as never);
    }

    openShareModal(shared: string): void {
        const modal = new ShareToChecklistModal(this.app, this.manager, {
            shared,
            definitions: this.settings.definitions,
            onItemAdded: (id) => {
                this.refreshMainViews();
                void id;
            },
        });
        modal.open();
    }

    async onunload(): Promise<void> {
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_CHECKLIST);
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_CHECKLIST_MAIN);
    }

    async loadSettings(): Promise<void> {
        const raw = await this.loadData();
        this.settings = migrateSettings(raw);
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }

    async setDefaultFolder(folder: string): Promise<void> {
        const normalized = normalizeFolder(folder);
        assertSafeFolder(normalized);
        this.settings = { ...this.settings, defaultFolder: normalized };
        await this.saveSettings();
    }

    // ----- view activation -----

    /** Open the sidebar in the LEFT panel (creates it if not already open). */
    private async activateSidebarView(): Promise<void> {
        const { workspace } = this.app;
        const existing = workspace.getLeavesOfType(VIEW_TYPE_CHECKLIST);
        let leaf: WorkspaceLeaf | null;
        if (existing.length > 0) {
            leaf = existing[0];
        } else {
            leaf = workspace.getLeftLeaf(false);
            if (!leaf) {
                new Notice("Could not open sidebar");
                return;
            }
            await leaf.setViewState({ type: VIEW_TYPE_CHECKLIST, active: true });
        }
        if (leaf) workspace.revealLeaf(leaf);
    }

    /**
     * Open the main content view for the given checklist id.
     * Reuses an existing main leaf if one is already open.
     */
    private async activateMainView(id: string): Promise<void> {
        const { workspace } = this.app;
        const existing = workspace.getLeavesOfType(VIEW_TYPE_CHECKLIST_MAIN);
        let leaf: WorkspaceLeaf | null;
        if (existing.length > 0) {
            leaf = existing[0];
        } else {
            leaf = workspace.getLeaf(false);
            if (!leaf) {
                new Notice("Could not open main view");
                return;
            }
            await leaf.setViewState({ type: VIEW_TYPE_CHECKLIST_MAIN, active: true });
        }
        if (leaf) workspace.revealLeaf(leaf);
        const view = leaf?.view;
        if (view instanceof ChecklistMainView) {
            await view.selectChecklist(id);
        }
    }

    // ----- list management -----

    /**
     * Open the native Obsidian modal for creating a new checklist.
     */
    openCreateListModal(): void {
        const modal = new CreateListModal(
            this.app,
            { defaultFolder: this.settings.defaultFolder },
            async (def) => {
                if (this.settings.definitions.find((d) => d.id === def.id)) {
                    throw new Error("A checklist with that id already exists");
                }
                this.settings = {
                    ...this.settings,
                    definitions: [...this.settings.definitions, def],
                };
                await this.saveSettings();
                this.refreshSidebarViews();
                await this.activateSidebarView();
                new Notice(`Checklist "${def.name}" created`);
            }
        );
        modal.open();
    }

    /**
     * Open the native Obsidian modal for editing an existing checklist.
     */
    openEditListModal(def: ChecklistDefinition): void {
        const modal = new EditListModal(this.app, def, async (updated) => {
            this.settings = {
                ...this.settings,
                definitions: this.settings.definitions.map((d) =>
                    d.id === updated.id ? updated : d
                ),
            };
            await this.saveSettings();
            this.refreshSidebarViews();
            this.refreshMainViews();
        });
        modal.open();
    }

    /**
     * Remove a checklist definition from settings. Does not delete vault files.
     */
    async deleteList(id: string): Promise<void> {
        this.settings = {
            ...this.settings,
            definitions: this.settings.definitions.filter((d) => d.id !== id),
        };
        await this.saveSettings();
        this.refreshSidebarViews();
    }

    // ----- helpers -----

    private refreshSidebarViews(): void {
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHECKLIST);
        for (const leaf of leaves) {
            const v = leaf.view;
            if (v instanceof ChecklistSidebarView) v.refresh();
        }
    }

    private refreshMainViews(): void {
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHECKLIST_MAIN);
        for (const leaf of leaves) {
            const v = leaf.view;
            if (v instanceof ChecklistMainView) v.refresh();
        }
    }

    private handleVaultEvent(event: "create" | "modify" | "delete", file: unknown): void {
        if (!(file instanceof TFile)) return;
        if (file.extension !== "md") return;
        let changed = false;
        for (const def of this.settings.definitions) {
            if (this.manager.onFileEvent(event, file, def)) changed = true;
        }
        if (changed) {
            this.refreshMainViews();
        }
    }

    /**
     * Lightweight quick-add via window.prompt until a dedicated add-item
     * modal is implemented.
     */
    private async quickAddItem(def: ChecklistDefinition): Promise<void> {
        const name = typeof window !== "undefined" ? window.prompt(`New item in "${def.name}"`) : null;
        if (!name) return;
        try {
            await this.manager.createItem(def, name, {});
            new Notice(`Added "${name}"`);
        } catch (err) {
            new Notice(`Failed to add item: ${(err as Error).message}`);
        }
    }
}
