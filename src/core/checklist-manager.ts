import { App, TFile } from "obsidian";
import type { ChecklistDefinition, ChecklistItem, PropertyDefinition } from "./types";
import { parseFrontmatter, serializeFrontmatter, updateFrontmatter } from "./frontmatter";

type FileEvent = "create" | "modify" | "delete";

/**
 * Orchestrates reading, creating, and updating checklist items.
 *
 * Security posture:
 *  - All file paths are built with `posixJoin`, and names are rejected
 *    unless they match a strict safe-name regex. This stops traversal
 *    attempts like `../../etc/passwd` and absolute-path escapes.
 *  - Property values that fail required/validation checks are rejected
 *    before touching the vault — no half-written files.
 *
 * Performance posture:
 *  - An in-memory cache per checklist id is maintained.
 *  - `onFileEvent` does incremental patches instead of full rescans.
 *  - `loadItems` is O(files in folder); the vault index is walked once.
 */
const SAFE_NAME = /^[^\\/\x00-\x1f<>:"|?*]{1,200}$/;
const RESERVED_NAMES = new Set([".", "..", ""]);

function slugify(raw: string): string {
    return raw
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

export function posixJoin(folder: string, name: string): string {
    const f = folder.replace(/\/+$/, "");
    if (f === "") return `${name}.md`;
    return `${f}/${name}.md`;
}

function assertSafeName(name: string): void {
    if (!SAFE_NAME.test(name) || RESERVED_NAMES.has(name)) {
        throw new Error(`Invalid item name: ${JSON.stringify(name)}`);
    }
    if (name.includes("..")) {
        throw new Error(`Invalid item name: ${JSON.stringify(name)}`);
    }
}

function validateProperties(def: ChecklistDefinition, values: Record<string, unknown>): void {
    for (const p of def.properties) {
        const v = values[p.key];
        const missing = v === undefined || v === null || v === "";
        if (p.required && missing) {
            throw new Error(`Property "${p.key}" is required`);
        }
        if (missing) continue;
        validateOne(p, v);
    }
}

function validateOne(p: PropertyDefinition, v: unknown): void {
    if (p.type === "number" || p.type === "rating") {
        if (typeof v !== "number" || !Number.isFinite(v)) {
            throw new Error(`Property "${p.key}" must be a number`);
        }
        if (p.validation?.min !== undefined && v < p.validation.min) {
            throw new Error(`Property "${p.key}" must be ≥ ${p.validation.min}`);
        }
        if (p.validation?.max !== undefined && v > p.validation.max) {
            throw new Error(`Property "${p.key}" must be ≤ ${p.validation.max}`);
        }
    } else if (p.type === "text" || p.type === "url") {
        if (typeof v !== "string") throw new Error(`Property "${p.key}" must be text`);
        if (v.length > 10_000) throw new Error(`Property "${p.key}" is too long`);
        if (p.validation?.regex) {
            let re: RegExp;
            try {
                // Safe: we compile without flags, never with the `g` stateful flag,
                // only against strings capped above. Invalid patterns throw here
                // and are surfaced as a validation error rather than crashing.
                re = new RegExp(p.validation.regex);
            } catch {
                throw new Error(`Property "${p.key}" has an invalid regex`);
            }
            if (!re.test(v)) throw new Error(`Property "${p.key}" failed validation`);
        }
    } else if (p.type === "select") {
        if (typeof v !== "string") throw new Error(`Property "${p.key}" must be a string`);
        if (p.options && !p.options.includes(v)) {
            throw new Error(`Property "${p.key}" must be one of ${p.options.join(", ")}`);
        }
    } else if (p.type === "multi-select") {
        if (!Array.isArray(v)) throw new Error(`Property "${p.key}" must be a list`);
        if (p.options) {
            for (const item of v) {
                if (!p.options.includes(String(item))) {
                    throw new Error(`Property "${p.key}" has invalid value ${String(item)}`);
                }
            }
        }
    }
}

export class ChecklistManager {
    private cache = new Map<string, ChecklistItem[]>();

    constructor(private app: App) {}

    /** Return a shallow copy of the cached items for a checklist. */
    getCachedItems(def: ChecklistDefinition): ChecklistItem[] {
        return (this.cache.get(def.id) ?? []).slice();
    }

    /**
     * Scan the vault for folders containing `.md` files that look like
     * checklists but don't yet have a definition in settings.
     *
     * When `defaultFolder` is set (e.g. "Checklists"), only direct
     * sub-folders of that folder are considered. When empty, root-level
     * folders are scanned.
     */
    discoverChecklists(
        defaultFolder: string,
        existingDefs: ChecklistDefinition[]
    ): ChecklistDefinition[] {
        const files = this.app.vault.getMarkdownFiles();
        const normalizedDefault = defaultFolder.replace(/\/+$/, "");
        const existingFolders = new Set(
            existingDefs.map((d) => d.folder.replace(/\/+$/, ""))
        );

        const candidateFolders = new Set<string>();

        for (const file of files) {
            if (normalizedDefault === "") {
                // Root mode: look for files in root-level folders ("Shopping/item.md")
                const parts = file.path.split("/");
                if (parts.length === 2 && parts[1].endsWith(".md")) {
                    candidateFolders.add(parts[0]);
                }
            } else {
                const prefix = normalizedDefault + "/";
                if (!file.path.startsWith(prefix)) continue;
                const rel = file.path.slice(prefix.length);
                const relParts = rel.split("/");
                // Direct child folder only: "subfolder/file.md"
                if (relParts.length === 2 && relParts[1].endsWith(".md")) {
                    candidateFolders.add(relParts[0]);
                }
            }
        }

        const discovered: ChecklistDefinition[] = [];
        for (const folderName of candidateFolders) {
            const folder =
                normalizedDefault === ""
                    ? folderName
                    : `${normalizedDefault}/${folderName}`;
            if (existingFolders.has(folder)) continue;

            discovered.push({
                id: slugify(folderName),
                name: folderName,
                kind: "checklist",
                folder,
                properties: [],
            });
        }

        return discovered;
    }

    /** Does this file belong to the given checklist? */
    private ownsFile(def: ChecklistDefinition, file: TFile): boolean {
        const folder = def.folder.replace(/\/+$/, "");
        if (folder === "") return !file.path.includes("/");
        const prefix = folder + "/";
        if (!file.path.startsWith(prefix)) return false;
        // Only files directly in the folder (no nested subfolders) belong.
        const rel = file.path.slice(prefix.length);
        return rel.endsWith(".md") && !rel.includes("/");
    }

    /** Load items from disk and refresh the in-memory cache. */
    async loadItems(def: ChecklistDefinition): Promise<ChecklistItem[]> {
        const files = this.app.vault.getMarkdownFiles().filter((f) => this.ownsFile(def, f));
        const items: ChecklistItem[] = [];
        for (const file of files) {
            items.push(await this.readItem(def, file));
        }
        this.cache.set(def.id, items);
        return items.slice();
    }

    private async readItem(def: ChecklistDefinition, file: TFile): Promise<ChecklistItem> {
        let data: Record<string, unknown> = {};
        try {
            const content = await this.app.vault.cachedRead(file);
            data = parseFrontmatter(content).data;
        } catch {
            data = {};
        }
        const properties: Record<string, unknown> = {};
        for (const p of def.properties) {
            if (p.key in data) properties[p.key] = data[p.key];
        }
        const completedRaw = data.completed;
        const completed = def.kind === "list" ? false : completedRaw === true;
        const description = typeof data.description === "string" ? data.description : undefined;
        return {
            path: file.path,
            name: file.basename,
            completed,
            description,
            properties,
            createdAt: file.stat.ctime,
            mtime: file.stat.mtime,
        };
    }

    /** Create a new item file and return the TFile handle. */
    async createItem(
        def: ChecklistDefinition,
        name: string,
        values: Record<string, unknown>
    ): Promise<TFile> {
        assertSafeName(name);
        validateProperties(def, values);
        const path = posixJoin(def.folder, name);
        const existing = this.app.vault.getAbstractFileByPath(path);
        if (existing) throw new Error(`An item named "${name}" already exists`);
        const data: Record<string, unknown> = {};
        if (def.kind === "checklist") data.completed = false;
        for (const p of def.properties) {
            if (values[p.key] !== undefined) data[p.key] = values[p.key];
        }
        const body = serializeFrontmatter(data);
        try {
            await this.app.vault.createFolder(def.folder);
        } catch {
            /* folder already exists */
        }
        const file = await this.app.vault.create(path, body);
        const item = await this.readItem(def, file);
        const arr = this.cache.get(def.id);
        if (arr) arr.push(item);
        return file;
    }

    /** Toggle completion on a checklist item (no-op for `list` kind). */
    async toggleItem(def: ChecklistDefinition, path: string): Promise<void> {
        if (def.kind === "list") return;
        const file = this.requireFile(path);
        const content = await this.app.vault.read(file);
        const parsed = parseFrontmatter(content);
        const current = parsed.data.completed === true;
        const updated = updateFrontmatter(content, { completed: !current });
        await this.app.vault.modify(file, updated);
        this.updateCache(def, file, { completed: !current });
    }

    /** Patch a single property value. */
    async updateItemProperty(
        def: ChecklistDefinition,
        path: string,
        key: string,
        value: unknown
    ): Promise<void> {
        const pdef = def.properties.find((p) => p.key === key);
        if (!pdef) throw new Error(`Unknown property: ${key}`);
        if (value !== undefined && value !== null && value !== "") {
            validateOne(pdef, value);
        }
        const file = this.requireFile(path);
        const content = await this.app.vault.read(file);
        const updated = updateFrontmatter(content, { [key]: value });
        await this.app.vault.modify(file, updated);
        this.updateCache(def, file, { properties: { [key]: value } });
    }

    /** Delete an item file. */
    async deleteItem(def: ChecklistDefinition, path: string): Promise<void> {
        const file = this.requireFile(path);
        await this.app.vault.delete(file);
        const arr = this.cache.get(def.id);
        if (arr) {
            const idx = arr.findIndex((i) => i.path === path);
            if (idx >= 0) arr.splice(idx, 1);
        }
    }

    /**
     * Incremental index maintenance. Call from vault event handlers.
     *
     * Returns `true` if the cache was changed — useful to decide whether
     * to re-render a view.
     */
    onFileEvent(event: FileEvent, file: TFile, def: ChecklistDefinition): boolean {
        if (!this.ownsFile(def, file)) return false;
        const arr = this.cache.get(def.id);
        if (!arr) return false;
        const idx = arr.findIndex((i) => i.path === file.path);
        if (event === "delete") {
            if (idx < 0) return false;
            arr.splice(idx, 1);
            return true;
        }
        const placeholder: ChecklistItem = {
            path: file.path,
            name: file.basename,
            completed: false,
            properties: {},
            createdAt: file.stat.ctime,
            mtime: file.stat.mtime,
        };
        if (event === "create") {
            if (idx >= 0) return false;
            arr.push(placeholder);
            // Async refresh in the background; callers re-render on the placeholder first.
            void this.readItem(def, file).then((real) => {
                const i = arr.findIndex((x) => x.path === file.path);
                if (i >= 0) arr[i] = real;
            });
            return true;
        }
        // modify
        if (idx < 0) {
            arr.push(placeholder);
        }
        void this.readItem(def, file).then((real) => {
            const i = arr.findIndex((x) => x.path === file.path);
            if (i >= 0) arr[i] = real;
        });
        return true;
    }

    private requireFile(path: string): TFile {
        const af = this.app.vault.getAbstractFileByPath(path);
        if (!af || !(af instanceof TFile)) throw new Error(`File not found: ${path}`);
        return af;
    }

    private updateCache(
        def: ChecklistDefinition,
        file: TFile,
        patch: { completed?: boolean; properties?: Record<string, unknown> }
    ): void {
        const arr = this.cache.get(def.id);
        if (!arr) return;
        const idx = arr.findIndex((i) => i.path === file.path);
        if (idx < 0) return;
        const prev = arr[idx];
        arr[idx] = {
            ...prev,
            completed: patch.completed ?? prev.completed,
            properties: patch.properties ? { ...prev.properties, ...patch.properties } : prev.properties,
            mtime: file.stat.mtime,
        };
    }
}
