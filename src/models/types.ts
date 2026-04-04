/**
 * Supported property types for checklist front matter fields.
 */
export type PropertyType = "text" | "number" | "date" | "checkbox" | "dropdown";

/**
 * Defines a single property (front matter field) for a checklist.
 */
export interface PropertyDefinition {
    name: string;
    type: PropertyType;
    defaultValue?: string;
    options?: string[]; // for dropdown type
}

/**
 * A checklist definition — stored in plugin settings.
 */
export interface ChecklistDefinition {
    id: string;
    name: string;
    folderPath: string;
    properties: PropertyDefinition[];
    createdAt: string;
}

/**
 * Represents a single checklist item parsed from a markdown file.
 */
export interface ChecklistItem {
    filePath: string;
    name: string;
    description: string;
    properties: Record<string, string | number | boolean>;
    completed: boolean;
}

/**
 * Plugin settings stored via Obsidian's data.json.
 */
export interface ChecklistPluginSettings {
    checklists: ChecklistDefinition[];
    activeChecklistId: string | null;
}

export const DEFAULT_SETTINGS: ChecklistPluginSettings = {
    checklists: [],
    activeChecklistId: null,
};
