import { App, TFile } from "obsidian";
import {
    ChecklistDefinition,
    ChecklistItem,
    ChecklistPluginSettings,
    PropertyDefinition,
} from "../models/types";
import { generateFrontmatter, parseFrontmatter } from "../utils/frontmatter";

/**
 * Generates a simple unique ID.
 */
function generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

/**
 * Manages checklist definitions and items.
 * Handles CRUD operations for checklists and their items via the Obsidian vault.
 */
export class ChecklistManager {
    private app: App;
    private settings: ChecklistPluginSettings;
    private save: () => Promise<void>;

    constructor(app: App, settings: ChecklistPluginSettings, save: () => Promise<void>) {
        this.app = app;
        this.settings = settings;
        this.save = save;
    }

    getSettings(): ChecklistPluginSettings {
        return this.settings;
    }

    updateSettings(settings: ChecklistPluginSettings): void {
        this.settings = settings;
    }

    /**
     * Creates a new checklist definition and its folder.
     */
    async createChecklist(name: string, properties: PropertyDefinition[]): Promise<ChecklistDefinition> {
        const folderPath = `checklists/${name}`;
        const checklist: ChecklistDefinition = {
            id: generateId(),
            name,
            folderPath,
            properties,
            createdAt: new Date().toISOString(),
        };

        this.settings.checklists.push(checklist);
        this.settings.activeChecklistId = checklist.id;

        await this.app.vault.createFolder(folderPath);
        await this.save();

        return checklist;
    }

    /**
     * Deletes a checklist definition from settings.
     * Does not delete the folder or files (user may want to keep them).
     */
    async deleteChecklist(id: string): Promise<void> {
        this.settings.checklists = this.settings.checklists.filter((c) => c.id !== id);

        if (this.settings.activeChecklistId === id) {
            this.settings.activeChecklistId = null;
        }

        await this.save();
    }

    /**
     * Adds a new item (markdown file) to a checklist folder.
     */
    async addItem(
        checklistId: string,
        name: string,
        properties: Record<string, string | number | boolean>,
        description: string
    ): Promise<TFile> {
        const [file] = await this.addItems(checklistId, [{ name, properties, description }]);
        return file;
    }

    /**
     * Adds multiple items (markdown files) to a checklist folder at once.
     */
    async addItems(
        checklistId: string,
        items: Array<{
            name: string;
            properties: Record<string, string | number | boolean>;
            description: string;
        }>
    ): Promise<TFile[]> {
        if (items.length === 0) return [];

        const checklist = this.findChecklist(checklistId);
        const files: TFile[] = [];

        for (const item of items) {
            const mergedProperties = this.mergeProperties(checklist.properties, item.properties);
            const frontmatter = generateFrontmatter(mergedProperties);
            const content = item.description
                ? `${frontmatter}\n\n${item.description}`
                : `${frontmatter}\n`;

            const filePath = `${checklist.folderPath}/${item.name}.md`;
            const file = await this.app.vault.create(filePath, content);
            files.push(file);
        }

        return files;
    }

    /**
     * Merges provided properties with defaults from property definitions.
     */
    private mergeProperties(
        definitions: PropertyDefinition[],
        properties: Record<string, string | number | boolean>
    ): Record<string, string | number | boolean> {
        const merged: Record<string, string | number | boolean> = {};
        for (const prop of definitions) {
            if (prop.name in properties) {
                merged[prop.name] = properties[prop.name];
            } else if (prop.defaultValue !== undefined) {
                merged[prop.name] = prop.defaultValue;
            }
        }
        for (const [key, value] of Object.entries(properties)) {
            if (!(key in merged)) {
                merged[key] = value;
            }
        }
        return merged;
    }

    /**
     * Marks an item as complete by deleting its file.
     */
    async completeItem(filePath: string): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (file instanceof TFile) {
            await this.app.vault.delete(file);
        } else {
            // Create a minimal TFile-like object for deletion
            await this.app.vault.delete({ path: filePath } as TFile);
        }
    }

    /**
     * Reads all items from a checklist's folder.
     */
    async getItems(checklistId: string): Promise<ChecklistItem[]> {
        const checklist = this.findChecklist(checklistId);
        const allFiles = this.app.vault.getMarkdownFiles();
        const checklistFiles = allFiles.filter((f) =>
            f.path.startsWith(checklist.folderPath + "/")
        );

        const items: ChecklistItem[] = [];
        for (const file of checklistFiles) {
            const content = await this.app.vault.read(file);
            const parsed = parseFrontmatter(content);
            items.push({
                filePath: file.path,
                name: file.basename,
                description: parsed.body,
                properties: parsed.properties,
                completed: parsed.properties["completed"] === "true",
            });
        }

        return items;
    }

    /**
     * Returns the active checklist definition, or null.
     */
    getActiveChecklist(): ChecklistDefinition | null {
        if (!this.settings.activeChecklistId) return null;
        return (
            this.settings.checklists.find(
                (c) => c.id === this.settings.activeChecklistId
            ) || null
        );
    }

    /**
     * Sets the active checklist by ID.
     */
    setActiveChecklist(id: string): void {
        this.settings.activeChecklistId = id;
        this.save();
    }

    /**
     * Finds a checklist by ID or throws.
     */
    private findChecklist(id: string): ChecklistDefinition {
        const checklist = this.settings.checklists.find((c) => c.id === id);
        if (!checklist) {
            throw new Error("Checklist not found");
        }
        return checklist;
    }
}
