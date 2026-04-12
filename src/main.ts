import { Notice, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_CHECKLIST } from "./constants";
import { ChecklistManager } from "./core/checklist-manager";
import { ChecklistSidebarView } from "./ui/sidebar-view";
import type { ChecklistDefinition } from "./core/types";

interface ChecklistSettings {
    /** Settings schema version — bump when the shape changes. */
    settingsVersion: number;
    definitions: ChecklistDefinition[];
}

const CURRENT_SETTINGS_VERSION = 1;

const DEFAULT_SETTINGS: ChecklistSettings = {
    settingsVersion: CURRENT_SETTINGS_VERSION,
    definitions: [],
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
    };
    if (version < 1) {
        // No prior versions; seed with defaults.
        settings = { ...settings, settingsVersion: 1 };
    }
    return settings;
}

export default class ChecklistPlugin extends Plugin {
    settings: ChecklistSettings = { ...DEFAULT_SETTINGS };
    manager!: ChecklistManager;

    async onload(): Promise<void> {
        await this.loadSettings();
        this.manager = new ChecklistManager(this.app);

        this.registerView(
            VIEW_TYPE_CHECKLIST,
            (leaf) =>
                new ChecklistSidebarView(leaf, {
                    manager: this.manager,
                    getDefinitions: () => this.settings.definitions,
                    saveSettings: () => this.saveData(this.settings),
                    openAddItemModal: async (def) => this.quickAddItem(def),
                    openCreateListModal: async () => this.quickCreateList(),
                })
        );

        this.addRibbonIcon("check-square", "Open checklist", async () => {
            await this.activateView();
        });

        this.addCommand({
            id: "checklist-open",
            name: "Open checklist sidebar",
            callback: async () => this.activateView(),
        });

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

    async onunload(): Promise<void> {
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_CHECKLIST);
    }

    async loadSettings(): Promise<void> {
        const raw = await this.loadData();
        this.settings = migrateSettings(raw);
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }

    /** Open the view in the LEFT sidebar only. */
    private async activateView(): Promise<void> {
        const { workspace } = this.app;
        const existing = workspace.getLeavesOfType(VIEW_TYPE_CHECKLIST);
        let leaf: WorkspaceLeaf | null;
        if (existing.length > 0) {
            leaf = existing[0];
        } else {
            leaf = workspace.getLeftLeaf(false);
            if (!leaf) {
                new Notice("Could not open left sidebar leaf");
                return;
            }
            await leaf.setViewState({ type: VIEW_TYPE_CHECKLIST, active: true });
        }
        if (leaf) workspace.revealLeaf(leaf);
    }

    private handleVaultEvent(event: "create" | "modify" | "delete", file: unknown): void {
        if (!(file instanceof TFile)) return;
        if (file.extension !== "md") return;
        let changed = false;
        for (const def of this.settings.definitions) {
            if (this.manager.onFileEvent(event, file, def)) changed = true;
        }
        if (changed) {
            const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHECKLIST);
            for (const leaf of leaves) {
                const v = leaf.view;
                if (v instanceof ChecklistSidebarView) v.refresh();
            }
        }
    }

    /**
     * Temporary lightweight "quick add" — asks via Notice until a modal is
     * needed. TASKS 3.5 (Quick-add bar) can later route through the toolbar
     * input directly.
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

    private async quickCreateList(): Promise<void> {
        const name = typeof window !== "undefined" ? window.prompt("Name the new checklist:") : null;
        if (!name) return;
        const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
        if (!id) {
            new Notice("Invalid checklist name");
            return;
        }
        if (this.settings.definitions.find((d) => d.id === id)) {
            new Notice("A checklist with that id already exists");
            return;
        }
        const def: ChecklistDefinition = {
            id,
            name,
            kind: "checklist",
            folder: name,
            properties: [],
        };
        this.settings.definitions.push(def);
        await this.saveSettings();
        await this.activateView();
    }
}
