import { Menu, Notice, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_CHECKLIST } from "./constants";
import { ChecklistManager } from "./core/checklist-manager";
import { ChecklistSidebarView } from "./ui/sidebar-view";
import {
    CreateListModal,
    assertSafeFolder,
    normalizeFolder,
} from "./ui/create-list-modal";
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

        this.registerView(
            VIEW_TYPE_CHECKLIST,
            (leaf) =>
                new ChecklistSidebarView(leaf, {
                    manager: this.manager,
                    getDefinitions: () => this.settings.definitions,
                    saveSettings: () => this.saveSettings(),
                    openAddItemModal: async (def) => this.quickAddItem(def),
                    openCreateListModal: async () => this.openCreateListModal(),
                })
        );

        this.addRibbonIcon("check-square", "Checklists", async () => {
            await this.activateView();
        });

        this.addCommand({
            id: "checklist-open",
            name: "Open checklist sidebar",
            callback: async () => this.activateView(),
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
     * menu for both shared text and shared URLs. Guarded behind
     * `app.isMobile` so desktop Obsidian isn't told about events it
     * doesn't fire.
     */
    private registerShareIntentHandlers(): void {
        // Some runtimes (desktop, older Obsidian) don't have `isMobile`;
        // treat its absence as "not mobile" and skip registration.
        const app = this.app as unknown as { isMobile?: boolean };
        if (!app.isMobile) return;

        const contribute = (menu: Menu, shared: string): void => {
            // Hard gate: only accept string payloads of a sane length.
            // A multi-megabyte share would otherwise balloon the DOM.
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

    /**
     * Opens the share-to-checklist modal for a captured payload. Exposed
     * (not private) so tests and future entry points (e.g. an
     * `obsidian://` protocol handler) can reuse it.
     */
    openShareModal(shared: string): void {
        const modal = new ShareToChecklistModal(this.app, this.manager, {
            shared,
            definitions: this.settings.definitions,
            onItemAdded: (id) => {
                // Refresh any open sidebar views so the new item shows up.
                const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHECKLIST);
                for (const leaf of leaves) {
                    const v = leaf.view;
                    if (v instanceof ChecklistSidebarView) v.refresh();
                }
                void id;
            },
        });
        modal.open();
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

    /**
     * Commit a new default folder. Validation is a hard gate — invalid
     * input throws *before* touching plugin state or disk.
     */
    async setDefaultFolder(folder: string): Promise<void> {
        const normalized = normalizeFolder(folder);
        assertSafeFolder(normalized);
        this.settings = { ...this.settings, defaultFolder: normalized };
        await this.saveSettings();
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

    /**
     * Open the native Obsidian modal for creating a new checklist. The
     * modal handles its own validation and hands us a fully-formed
     * definition — we only need to de-duplicate and persist it.
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
                await this.activateView();
                new Notice(`Checklist "${def.name}" created`);
            }
        );
        modal.open();
    }
}
