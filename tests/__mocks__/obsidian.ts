// Mock for the Obsidian API used in tests

export class Plugin {
    app: App;
    manifest: any;

    constructor(app: App, manifest: any) {
        this.app = app;
        this.manifest = manifest;
    }

    addRibbonIcon(_icon: string, _title: string, _callback: () => void) {
        return { remove: jest.fn() };
    }

    registerView(_type: string, _viewCreator: (leaf: WorkspaceLeaf) => ItemView) {}

    addCommand(_command: any) {}

    loadData(): Promise<any> {
        return Promise.resolve(null);
    }

    saveData(_data: any): Promise<void> {
        return Promise.resolve();
    }
}

export class ItemView {
    containerEl: HTMLElement;
    leaf: WorkspaceLeaf;

    constructor(leaf: WorkspaceLeaf) {
        this.leaf = leaf;
        this.containerEl = document.createElement("div");
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

    async onOpen(): Promise<void> {}

    async onClose(): Promise<void> {}
}

export class Modal {
    app: App;
    containerEl: HTMLElement;
    contentEl: HTMLElement;
    modalEl: HTMLElement;
    titleEl: HTMLElement;

    constructor(app: App) {
        this.app = app;
        this.containerEl = document.createElement("div");
        this.contentEl = document.createElement("div");
        this.modalEl = document.createElement("div");
        this.titleEl = document.createElement("div");
    }

    open() {}
    close() {}
    onOpen() {}
    onClose() {}
}

export class Setting {
    settingEl: HTMLElement;
    nameEl: HTMLElement;
    descEl: HTMLElement;
    controlEl: HTMLElement;
    private _name: string = "";

    constructor(_containerEl: HTMLElement) {
        this.settingEl = document.createElement("div");
        this.nameEl = document.createElement("div");
        this.descEl = document.createElement("div");
        this.controlEl = document.createElement("div");
    }

    setName(name: string): this {
        this._name = name;
        this.nameEl.textContent = name;
        return this;
    }

    setDesc(_desc: string): this {
        return this;
    }

    addText(cb: (text: TextComponent) => void): this {
        cb(new TextComponent(this.controlEl));
        return this;
    }

    addTextArea(cb: (text: TextAreaComponent) => void): this {
        cb(new TextAreaComponent(this.controlEl));
        return this;
    }

    addButton(cb: (button: ButtonComponent) => void): this {
        cb(new ButtonComponent(this.controlEl));
        return this;
    }

    addDropdown(cb: (dropdown: DropdownComponent) => void): this {
        cb(new DropdownComponent(this.controlEl));
        return this;
    }

    addToggle(cb: (toggle: ToggleComponent) => void): this {
        cb(new ToggleComponent(this.controlEl));
        return this;
    }
}

export class TextComponent {
    inputEl: HTMLInputElement;
    private _value: string = "";

    constructor(_containerEl: HTMLElement) {
        this.inputEl = document.createElement("input");
    }

    setValue(value: string): this {
        this._value = value;
        this.inputEl.value = value;
        return this;
    }

    getValue(): string {
        return this._value;
    }

    setPlaceholder(_placeholder: string): this {
        return this;
    }

    onChange(_callback: (value: string) => void): this {
        return this;
    }
}

export class TextAreaComponent {
    inputEl: HTMLTextAreaElement;
    private _value: string = "";

    constructor(_containerEl: HTMLElement) {
        this.inputEl = document.createElement("textarea");
    }

    setValue(value: string): this {
        this._value = value;
        this.inputEl.value = value;
        return this;
    }

    getValue(): string {
        return this._value;
    }

    setPlaceholder(_placeholder: string): this {
        return this;
    }

    onChange(_callback: (value: string) => void): this {
        return this;
    }
}

export class ButtonComponent {
    buttonEl: HTMLButtonElement;

    constructor(_containerEl: HTMLElement) {
        this.buttonEl = document.createElement("button");
    }

    setButtonText(_text: string): this {
        return this;
    }

    setCta(): this {
        return this;
    }

    setWarning(): this {
        return this;
    }

    onClick(callback: () => void): this {
        this.buttonEl.addEventListener("click", callback);
        return this;
    }

    setIcon(_icon: string): this {
        return this;
    }
}

export class DropdownComponent {
    selectEl: HTMLSelectElement;
    private _value: string = "";

    constructor(_containerEl: HTMLElement) {
        this.selectEl = document.createElement("select");
    }

    addOption(value: string, _display: string): this {
        return this;
    }

    setValue(value: string): this {
        this._value = value;
        return this;
    }

    getValue(): string {
        return this._value;
    }

    onChange(_callback: (value: string) => void): this {
        return this;
    }
}

export class ToggleComponent {
    toggleEl: HTMLElement;
    private _value: boolean = false;

    constructor(_containerEl: HTMLElement) {
        this.toggleEl = document.createElement("div");
    }

    setValue(value: boolean): this {
        this._value = value;
        return this;
    }

    getValue(): boolean {
        return this._value;
    }

    onChange(_callback: (value: boolean) => void): this {
        return this;
    }
}

export class WorkspaceLeaf {
    view: ItemView;

    constructor() {
        this.view = new ItemView(this);
    }

    openFile(_file: TFile): void {}

    setViewState(_state: any): Promise<void> {
        return Promise.resolve();
    }
}

export class TFile {
    path: string;
    basename: string;
    name: string;
    extension: string;
    parent: TFolder | null;

    constructor(path: string = "") {
        this.path = path;
        this.basename = path.split("/").pop()?.replace(/\.\w+$/, "") || "";
        this.name = path.split("/").pop() || "";
        this.extension = "md";
        this.parent = null;
    }
}

export class TFolder {
    path: string;
    name: string;
    children: (TFile | TFolder)[];

    constructor(path: string = "") {
        this.path = path;
        this.name = path.split("/").pop() || "";
        this.children = [];
    }
}

export class Vault {
    private files: Map<string, string> = new Map();

    async create(path: string, content: string): Promise<TFile> {
        this.files.set(path, content);
        return new TFile(path);
    }

    async read(file: TFile): Promise<string> {
        return this.files.get(file.path) || "";
    }

    async modify(file: TFile, content: string): Promise<void> {
        this.files.set(file.path, content);
    }

    async delete(file: TFile): Promise<void> {
        this.files.delete(file.path);
    }

    async createFolder(path: string): Promise<void> {
        // no-op in mock
    }

    getAbstractFileByPath(path: string): TFile | TFolder | null {
        if (this.files.has(path)) {
            return new TFile(path);
        }
        return null;
    }

    getMarkdownFiles(): TFile[] {
        return Array.from(this.files.keys()).map((p) => new TFile(p));
    }

    getFiles(): TFile[] {
        return this.getMarkdownFiles();
    }
}

export class MetadataCache {
    getFileCache(_file: TFile): any {
        return null;
    }

    getCache(_path: string): any {
        return null;
    }
}

export class Workspace {
    private leaves: Map<string, WorkspaceLeaf[]> = new Map();

    getLeavesOfType(type: string): WorkspaceLeaf[] {
        return this.leaves.get(type) || [];
    }

    getLeftLeaf(_split: boolean): WorkspaceLeaf {
        return new WorkspaceLeaf();
    }

    getRightLeaf(_split: boolean): WorkspaceLeaf {
        return new WorkspaceLeaf();
    }

    revealLeaf(_leaf: WorkspaceLeaf): void {}

    detachLeavesOfType(_type: string): void {}
}

export class App {
    vault: Vault;
    workspace: Workspace;
    metadataCache: MetadataCache;

    constructor() {
        this.vault = new Vault();
        this.workspace = new Workspace();
        this.metadataCache = new MetadataCache();
    }
}

export class Notice {
    constructor(_message: string, _timeout?: number) {}
}

export function setIcon(_el: HTMLElement, _icon: string): void {}
