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

export interface RegisteredRibbon {
    icon: string;
    title: string;
    cb: (evt?: MouseEvent) => void | Promise<void>;
    el: HTMLElement;
}

export interface RegisteredCommand {
    id: string;
    name: string;
    callback?: () => void | Promise<void>;
    checkCallback?: (checking: boolean) => boolean | void;
}

export class Plugin extends Component {
    app: App;
    manifest: { id: string; name: string; version: string };
    /** Test-visible registration ledgers. */
    public ribbons: RegisteredRibbon[] = [];
    public commands: RegisteredCommand[] = [];
    public settingTabs: PluginSettingTab[] = [];
    public registeredViews: Record<string, (leaf: WorkspaceLeaf) => ItemView> = {};
    /** In-memory store used by loadData/saveData. */
    private _data: unknown = null;

    constructor(app?: App, manifest?: { id: string; name: string; version: string }) {
        super();
        this.app = app ?? new App();
        this.manifest = manifest ?? { id: "test", name: "Test", version: "0.0.0" };
    }
    registerView(type: string, factory: (leaf: WorkspaceLeaf) => ItemView): void {
        this.registeredViews[type] = factory;
    }
    addRibbonIcon(
        icon: string,
        title: string,
        cb: (evt?: MouseEvent) => void | Promise<void>
    ): HTMLElement {
        const el = document.createElement("div");
        el.setAttribute("aria-label", title);
        el.setAttribute("data-icon", icon);
        el.addEventListener("click", () => {
            void cb();
        });
        this.ribbons.push({ icon, title, cb, el });
        return el;
    }
    addCommand(cmd: RegisteredCommand): void {
        this.commands.push(cmd);
    }
    addSettingTab(tab: PluginSettingTab): void {
        this.settingTabs.push(tab);
    }
    async loadData(): Promise<unknown> {
        return this._data;
    }
    async saveData(data: unknown): Promise<void> {
        this._data = data;
    }
    registerEvent(_evt: unknown): void {}
}

// Simple helper the plugin uses for icon rendering in tests
export function setIcon(el: HTMLElement, icon: string): void {
    el.setAttribute("data-icon", icon);
}

/**
 * Minimal Modal mock. The real Obsidian API exposes `open()` / `close()`
 * and expects subclasses to override `onOpen()` / `onClose()`.
 */
export class Modal {
    app: App;
    containerEl: HTMLElement;
    modalEl: HTMLElement;
    titleEl: HTMLElement;
    contentEl: HTMLElement;
    public isOpen = false;

    constructor(app: App) {
        this.app = app;
        this.containerEl = document.createElement("div");
        this.containerEl.classList.add("modal-container");
        this.modalEl = document.createElement("div");
        this.modalEl.classList.add("modal");
        this.titleEl = document.createElement("div");
        this.titleEl.classList.add("modal-title");
        this.contentEl = document.createElement("div");
        this.contentEl.classList.add("modal-content");
        this.modalEl.appendChild(this.titleEl);
        this.modalEl.appendChild(this.contentEl);
        this.containerEl.appendChild(this.modalEl);
    }
    open(): void {
        if (this.isOpen) return;
        this.isOpen = true;
        // Attach to document so querySelectorAll works in tests.
        document.body.appendChild(this.containerEl);
        this.onOpen();
    }
    close(): void {
        if (!this.isOpen) return;
        this.isOpen = false;
        this.onClose();
        if (this.containerEl.parentNode) {
            this.containerEl.parentNode.removeChild(this.containerEl);
        }
        this.contentEl.empty();
    }
    onOpen(): void {}
    onClose(): void {}
}

/**
 * Fluent Setting builder. Mirrors the subset of Obsidian's API we use:
 * setName, setDesc, addText, addButton.
 */
export class Setting {
    public settingEl: HTMLElement;
    public nameEl: HTMLElement;
    public descEl: HTMLElement;
    public controlEl: HTMLElement;
    public components: Array<TextComponent | ButtonComponent> = [];

    constructor(containerEl: HTMLElement) {
        this.settingEl = document.createElement("div");
        this.settingEl.classList.add("setting-item");
        this.nameEl = document.createElement("div");
        this.nameEl.classList.add("setting-item-name");
        this.descEl = document.createElement("div");
        this.descEl.classList.add("setting-item-description");
        this.controlEl = document.createElement("div");
        this.controlEl.classList.add("setting-item-control");
        this.settingEl.appendChild(this.nameEl);
        this.settingEl.appendChild(this.descEl);
        this.settingEl.appendChild(this.controlEl);
        containerEl.appendChild(this.settingEl);
    }
    setName(name: string): this {
        this.nameEl.textContent = name;
        return this;
    }
    setDesc(desc: string): this {
        this.descEl.textContent = desc;
        return this;
    }
    addText(cb: (text: TextComponent) => void): this {
        const t = new TextComponent(this.controlEl);
        this.components.push(t);
        cb(t);
        return this;
    }
    addButton(cb: (btn: ButtonComponent) => void): this {
        const b = new ButtonComponent(this.controlEl);
        this.components.push(b);
        cb(b);
        return this;
    }
}

export class TextComponent {
    public inputEl: HTMLInputElement;
    private _onChange: ((value: string) => void | Promise<void>) | null = null;
    constructor(containerEl: HTMLElement) {
        this.inputEl = document.createElement("input");
        this.inputEl.type = "text";
        containerEl.appendChild(this.inputEl);
        this.inputEl.addEventListener("input", () => {
            if (this._onChange) void this._onChange(this.inputEl.value);
        });
    }
    setPlaceholder(p: string): this {
        this.inputEl.placeholder = p;
        return this;
    }
    setValue(v: string): this {
        this.inputEl.value = v;
        return this;
    }
    getValue(): string {
        return this.inputEl.value;
    }
    onChange(cb: (value: string) => void | Promise<void>): this {
        this._onChange = cb;
        return this;
    }
}

export class ButtonComponent {
    public buttonEl: HTMLButtonElement;
    private _onClick: (() => void | Promise<void>) | null = null;
    constructor(containerEl: HTMLElement) {
        this.buttonEl = document.createElement("button");
        containerEl.appendChild(this.buttonEl);
        this.buttonEl.addEventListener("click", () => {
            if (this._onClick) void this._onClick();
        });
    }
    setButtonText(t: string): this {
        this.buttonEl.textContent = t;
        return this;
    }
    setCta(): this {
        this.buttonEl.classList.add("mod-cta");
        return this;
    }
    setWarning(): this {
        this.buttonEl.classList.add("mod-warning");
        return this;
    }
    onClick(cb: () => void | Promise<void>): this {
        this._onClick = cb;
        return this;
    }
}

export class PluginSettingTab {
    app: App;
    plugin: Plugin;
    containerEl: HTMLElement;
    constructor(app: App, plugin: Plugin) {
        this.app = app;
        this.plugin = plugin;
        this.containerEl = document.createElement("div");
    }
    display(): void {}
    hide(): void {}
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
