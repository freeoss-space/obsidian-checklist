/**
 * Core data types for the Checklist plugin.
 *
 * Design principles:
 * - Data model is plain data (no methods).
 * - Every checklist lives in a single folder of markdown notes.
 * - Each item is a single `.md` file whose YAML front matter holds
 *   the typed properties.
 */

export type PropertyType =
    | "text"
    | "number"
    | "date"
    | "checkbox"
    | "select"
    | "multi-select"
    | "url"
    | "rating";

export interface PropertyValidation {
    min?: number;
    max?: number;
    /** ECMAScript regex source (no flags). Anchors are optional. */
    regex?: string;
}

export interface PropertyDefinition {
    key: string;
    type: PropertyType;
    /** Display label; defaults to the key. */
    label?: string;
    /** If present, dropdown / multi-select options. */
    options?: string[];
    required?: boolean;
    validation?: PropertyValidation;
}

export type ChecklistKind = "checklist" | "list";

export interface ChecklistDefinition {
    id: string;
    name: string;
    kind: ChecklistKind;
    /** Vault-relative folder. Items are `.md` files inside this folder. */
    folder: string;
    properties: PropertyDefinition[];
}

export interface ChecklistItem {
    /** Vault-relative path. */
    path: string;
    /** File basename without extension. */
    name: string;
    /** Only meaningful when the parent checklist has kind === "checklist". */
    completed: boolean;
    /** Optional free-form description field. */
    description?: string;
    /** Typed front-matter property values. */
    properties: Record<string, unknown>;
    /** Creation time (ms since epoch). */
    createdAt: number;
    /** Last modification time (ms since epoch). */
    mtime: number;
}

export type SortDirection = "asc" | "desc";

export interface SortOptions {
    key: string;
    dir: SortDirection;
}

export type StatusFilter = "all" | "active" | "done";

export interface FilterOptions {
    query: string;
    status: StatusFilter;
    /** key -> list of allowed values. Empty list means "no constraint". */
    properties?: Record<string, unknown[]>;
}

export interface ItemGroup {
    label: string;
    items: ChecklistItem[];
    count: number;
}
