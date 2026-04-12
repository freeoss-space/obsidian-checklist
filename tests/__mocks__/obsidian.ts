/* Minimal Obsidian API mock sufficient for unit tests. */

export class Notice {
    constructor(public message: string, public timeout?: number) {}
}

export class Events {
    private handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
    on(event: string, cb: (...args: unknown[]) => void): { event: string; cb: (...args: unknown[]) => void } {
        (this.handlers[event] ||= []).push(cb);
        return { event, cb };
    }
    off(event: string, cb: (...args: unknown[]) => void): void {
        this.handlers[event] = (this.handlers[event] || []).filter((h) => h !== cb);
    }
    trigger(event: string, ...args: unknown[]): void {
        (this.handlers[event] || []).forEach((h) => h(...args));
    }
}

export class TFile {
    public basename: string;
    public extension = "md";
    public stat: { ctime: number; mtime: number; size: number };
    constructor(public path: string, mtime = 0, ctime = 0, size = 0) {
        const name = path.split("/").pop() || path;
        this.basename = name.replace(/\.md$/, "");
        this.stat = { ctime, mtime, size };
    }
}

export class TFolder {
    public children: Array<TFile | TFolder> = [];
    constructor(public path: string) {}
}

export interface CachedMetadata {
    frontmatter?: Record<string, unknown>;
}

export class MetadataCache extends Events {
    private cache = new Map<string, CachedMetadata>();
    setCache(path: string, meta: CachedMetadata) {
        this.cache.set(path, meta);
    }
    getFileCache(file: TFile): CachedMetadata | null {
        return this.cache.get(file.path) || null;
    }
}

export class Vault extends Events {
    private files = new Map<string, { file: TFile; content: string }>();
    private folders = new Set<string>();

    addFile(path: string, content: string): TFile {
        const file = new TFile(path, Date.now(), Date.now(), content.length);
        this.files.set(path, { file, content });
        return file;
    }

    getAbstractFileByPath(path: string): TFile | TFolder | null {
        const entry = this.files.get(path);
        if (entry) return entry.file;
        if (this.folders.has(path)) return new TFolder(path);
        return null;
    }

    getMarkdownFiles(): TFile[] {
        return Array.from(this.files.values()).map((e) => e.file);
    }

    async read(file: TFile): Promise<string> {
        const entry = this.files.get(file.path);
        if (!entry) throw new Error(`File not found: ${file.path}`);
        return entry.content;
    }

    async cachedRead(file: TFile): Promise<string> {
        return this.read(file);
    }

    async modify(file: TFile, content: string): Promise<void> {
        const entry = this.files.get(file.path);
        if (!entry) throw new Error(`File not found: ${file.path}`);
        entry.content = content;
        file.stat.mtime = Date.now();
        file.stat.size = content.length;
        this.trigger("modify", file);
    }

    async create(path: string, content: string): Promise<TFile> {
        if (this.files.has(path)) throw new Error(`File exists: ${path}`);
        const file = this.addFile(path, content);
        this.trigger("create", file);
        return file;
    }

    async delete(file: TFile): Promise<void> {
        this.files.delete(file.path);
        this.trigger("delete", file);
    }

    async createFolder(path: string): Promise<void> {
        this.folders.add(path);
    }
}

export class Workspace extends Events {
    getLeavesOfType(_type: string): WorkspaceLeaf[] {
        return [];
    }
    getLeftLeaf(_split: boolean): WorkspaceLeaf {
        return new WorkspaceLeaf();
    }
    revealLeaf(_leaf: WorkspaceLeaf): void {}
    detachLeavesOfType(_type: string): void {}
}

export class WorkspaceLeaf {
    view: unknown;
    async setViewState(_state: { type: string; active: boolean }): Promise<void> {}
}

export class App {
    vault = new Vault();
    metadataCache = new MetadataCache();
    workspace = new Workspace();
}

export class Component {
    onload(): void {}
    onunload(): void {}
}

export class ItemView extends Component {
    contentEl: HTMLElement;
    containerEl: HTMLElement;
    constructor(public leaf: WorkspaceLeaf) {
        super();
        this.containerEl = document.createElement("div");
        this.contentEl = document.createElement("div");
        this.containerEl.appendChild(this.contentEl);
    }
    getViewType(): string {
        return "";
    }
    getDisplayText(): string {
        return "";
    }
    getIcon(): string {
        return "";
    }
}

export class Plugin extends Component {
    app: App;
    manifest: { id: string; name: string; version: string };
    constructor(app: App, manifest: { id: string; name: string; version: string }) {
        super();
        this.app = app;
        this.manifest = manifest;
    }
    registerView(_type: string, _factory: (leaf: WorkspaceLeaf) => ItemView): void {}
    addRibbonIcon(_icon: string, _title: string, _cb: () => void): HTMLElement {
        return document.createElement("div");
    }
    addCommand(_cmd: { id: string; name: string; callback: () => void }): void {}
    async loadData(): Promise<unknown> {
        return null;
    }
    async saveData(_data: unknown): Promise<void> {}
    registerEvent(_evt: unknown): void {}
}

// Simple helper the plugin uses for icon rendering in tests
export function setIcon(el: HTMLElement, icon: string): void {
    el.setAttribute("data-icon", icon);
}

// Add DOM helpers used by Obsidian plugins in real code (createEl etc.)
declare global {
    interface HTMLElement {
        createEl<K extends keyof HTMLElementTagNameMap>(
            tag: K,
            opts?: { text?: string; cls?: string | string[]; attr?: Record<string, string> }
        ): HTMLElementTagNameMap[K];
        createDiv(opts?: { cls?: string | string[]; text?: string }): HTMLDivElement;
        empty(): void;
        addClass(cls: string): void;
        removeClass(cls: string): void;
        toggleClass(cls: string, force?: boolean): void;
        setText(text: string): void;
    }
}

if (typeof HTMLElement !== "undefined") {
    if (!HTMLElement.prototype.createEl) {
        HTMLElement.prototype.createEl = function <K extends keyof HTMLElementTagNameMap>(
            this: HTMLElement,
            tag: K,
            opts?: { text?: string; cls?: string | string[]; attr?: Record<string, string> }
        ): HTMLElementTagNameMap[K] {
            const el = document.createElement(tag);
            if (opts?.text !== undefined) el.textContent = opts.text;
            if (opts?.cls) {
                const classes = Array.isArray(opts.cls) ? opts.cls : [opts.cls];
                classes.forEach((c) => el.classList.add(c));
            }
            if (opts?.attr) {
                for (const k of Object.keys(opts.attr)) el.setAttribute(k, opts.attr[k]);
            }
            this.appendChild(el);
            return el;
        };
    }
    if (!HTMLElement.prototype.createDiv) {
        HTMLElement.prototype.createDiv = function (
            this: HTMLElement,
            opts?: { cls?: string | string[]; text?: string }
        ): HTMLDivElement {
            return this.createEl("div", opts);
        };
    }
    if (!HTMLElement.prototype.empty) {
        HTMLElement.prototype.empty = function (this: HTMLElement): void {
            while (this.firstChild) this.removeChild(this.firstChild);
        };
    }
    if (!HTMLElement.prototype.addClass) {
        HTMLElement.prototype.addClass = function (this: HTMLElement, cls: string): void {
            this.classList.add(cls);
        };
    }
    if (!HTMLElement.prototype.removeClass) {
        HTMLElement.prototype.removeClass = function (this: HTMLElement, cls: string): void {
            this.classList.remove(cls);
        };
    }
    if (!HTMLElement.prototype.toggleClass) {
        HTMLElement.prototype.toggleClass = function (this: HTMLElement, cls: string, force?: boolean): void {
            this.classList.toggle(cls, force);
        };
    }
    if (!HTMLElement.prototype.setText) {
        HTMLElement.prototype.setText = function (this: HTMLElement, text: string): void {
            this.textContent = text;
        };
    }
}
