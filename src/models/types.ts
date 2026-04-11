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
/**
 * Kind of list. "checklist" tracks completion via checkboxes; "list" omits
 * the completion concept entirely (useful as a properties catalogue / inventory).
 */
export type ChecklistKind = "checklist" | "list";

export interface ChecklistDefinition {
    id: string;
    name: string;
    folderPath: string;
    properties: PropertyDefinition[];
    inlineAddMode?: "simple" | "form";
    createdAt: string;
    kind: ChecklistKind;
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
    checklistsFolder: string;
}

export const DEFAULT_CHECKLISTS_FOLDER = "checklists";

export const DEFAULT_SETTINGS: ChecklistPluginSettings = {
    checklists: [],
    activeChecklistId: null,
    checklistsFolder: DEFAULT_CHECKLISTS_FOLDER,
};
