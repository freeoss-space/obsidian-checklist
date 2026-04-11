import { ItemView, WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_CHECKLIST } from "../constants";
import type { ChecklistManager } from "../core/checklist-manager";
import type {
    ChecklistDefinition,
    ChecklistItem,
    FilterOptions,
    SortOptions,
} from "../core/types";
import { filterItems } from "../core/filter";
import { sortItems } from "../core/sort";
import { groupItems } from "../core/group";

/**
 * Callbacks the view needs from the plugin. Keeping this as a plain
 * dependency object instead of a hard reference to `Plugin` lets us
 * unit test the view in isolation.
 */
export interface ChecklistSidebarDeps {
    manager: ChecklistManager;
    getDefinitions: () => ChecklistDefinition[];
    saveSettings: () => Promise<void>;
    openAddItemModal: (def: ChecklistDefinition) => Promise<void>;
    openCreateListModal: () => Promise<void>;
}

interface ViewState {
    sort: SortOptions;
    filter: FilterOptions;
    groupBy: string | null;
}

function defaultViewState(): ViewState {
    return {
        sort: { key: "name", dir: "asc" },
        filter: { query: "", status: "all" },
        groupBy: null,
    };
}

/**
 * The only view the plugin ships. Lives in the LEFT sidebar by design.
 *
 * Layout:
 *   ┌──────────────────────────────┐
 *   │  [+ New list]   [dropdown]   │  ← header
 *   ├──────────────────────────────┤
 *   │  [search]  [status][+ Add]   │  ← toolbar
 *   ├──────────────────────────────┤
 *   │  ☐  Apple                    │
 *   │  ☐  Banana       Author      │  ← scrollable list
 *   │  ✓  Cherry                   │
 *   └──────────────────────────────┘
 */
export class ChecklistSidebarView extends ItemView {
    private deps: ChecklistSidebarDeps;
    private activeId: string | null = null;
    private stateById = new Map<string, ViewState>();
    private headerEl!: HTMLElement;
    private toolbarEl!: HTMLElement;
    private listEl!: HTMLElement;
    private searchInput!: HTMLInputElement;
    private statusSelect!: HTMLSelectElement;

    constructor(leaf: WorkspaceLeaf, deps: ChecklistSidebarDeps) {
        super(leaf);
        this.deps = deps;
    }

    getViewType(): string {
        return VIEW_TYPE_CHECKLIST;
    }

    getDisplayText(): string {
        return "Checklist";
    }

    getIcon(): string {
        return "check-square";
    }

    async onOpen(): Promise<void> {
        const root = this.contentEl;
        root.empty();
        root.addClass("checklist-plugin-root");

        this.headerEl = root.createDiv({ cls: "checklist-header" });
        this.toolbarEl = root.createDiv({ cls: "checklist-toolbar" });
        this.listEl = root.createDiv({ cls: "checklist-list" });

        this.renderHeader();
        this.renderToolbar();

        const defs = this.deps.getDefinitions();
        if (defs.length > 0) {
            await this.selectChecklist(defs[0].id);
        } else {
            this.renderEmpty();
        }
    }

    async onClose(): Promise<void> {
        this.contentEl.empty();
    }

    /** Switch to a different checklist. */
    async selectChecklist(id: string): Promise<void> {
        this.activeId = id;
        if (!this.stateById.has(id)) this.stateById.set(id, defaultViewState());
        const def = this.definition();
        if (!def) {
            this.renderEmpty();
            return;
        }
        await this.deps.manager.loadItems(def);
        this.renderHeader();
        this.renderList();
    }

    /** Re-render only the list portion (called on filter/sort changes). */
    refresh(): void {
        if (!this.activeId) return;
        this.renderList();
    }

    // ----- rendering -----

    private renderHeader(): void {
        this.headerEl.empty();
        const defs = this.deps.getDefinitions();
        const left = this.headerEl.createDiv({ cls: "checklist-header-left" });
        const newBtn = left.createEl("button", { text: "+ New list", cls: "checklist-new-list" });
        newBtn.addEventListener("click", () => {
            void this.deps.openCreateListModal();
        });

        const select = this.headerEl.createEl("select", { cls: "checklist-picker" });
        if (defs.length === 0) {
            select.createEl("option", { text: "No checklists", attr: { value: "" } });
            select.disabled = true;
        } else {
            for (const d of defs) {
                const opt = select.createEl("option", { text: d.name, attr: { value: d.id } });
                if (d.id === this.activeId) opt.selected = true;
            }
            select.addEventListener("change", () => {
                void this.selectChecklist(select.value);
            });
        }
    }

    private renderToolbar(): void {
        this.toolbarEl.empty();
        this.searchInput = this.toolbarEl.createEl("input", {
            cls: "checklist-search",
            attr: { type: "search", placeholder: "Search…" },
        });
        this.searchInput.addEventListener("input", () => {
            const st = this.currentState();
            if (!st) return;
            st.filter = { ...st.filter, query: this.searchInput.value };
            this.refresh();
        });

        this.statusSelect = this.toolbarEl.createEl("select", { cls: "checklist-status" });
        for (const [v, label] of [
            ["all", "All"],
            ["active", "Active"],
            ["done", "Done"],
        ] as const) {
            this.statusSelect.createEl("option", { text: label, attr: { value: v } });
        }
        this.statusSelect.addEventListener("change", () => {
            const st = this.currentState();
            if (!st) return;
            st.filter = { ...st.filter, status: this.statusSelect.value as FilterOptions["status"] };
            this.refresh();
        });

        const addBtn = this.toolbarEl.createEl("button", { text: "+ Add", cls: "checklist-add" });
        addBtn.addEventListener("click", () => {
            const def = this.definition();
            if (def) void this.deps.openAddItemModal(def);
        });
    }

    private renderEmpty(): void {
        this.listEl.empty();
        this.listEl.createDiv({
            cls: "checklist-empty",
            text: "No checklists yet. Click '+ New list' to create one.",
        });
    }

    private renderList(): void {
        const def = this.definition();
        const state = this.currentState();
        if (!def || !state) {
            this.renderEmpty();
            return;
        }
        this.listEl.empty();
        const raw = this.deps.manager.getCachedItems(def);
        const filtered = filterItems(raw, state.filter);
        const sorted = sortItems(filtered, state.sort);
        const groups = groupItems(sorted, state.groupBy);

        if (sorted.length === 0) {
            this.listEl.createDiv({ cls: "checklist-empty", text: "No items match your filters." });
            return;
        }

        for (const group of groups) {
            if (state.groupBy !== null) {
                const header = this.listEl.createDiv({ cls: "checklist-group-header" });
                header.createEl("span", { text: group.label, cls: "checklist-group-label" });
                header.createEl("span", { text: `(${group.count})`, cls: "checklist-group-count" });
            }
            for (const item of group.items) {
                this.renderItemRow(def, item);
            }
        }
    }

    private renderItemRow(def: ChecklistDefinition, item: ChecklistItem): void {
        const row = this.listEl.createDiv({ cls: "checklist-item" });
        if (item.completed) row.addClass("is-completed");

        if (def.kind === "checklist") {
            const box = row.createEl("input", {
                cls: "checklist-checkbox",
                attr: { type: "checkbox" },
            });
            box.checked = item.completed;
            box.addEventListener("change", async () => {
                try {
                    await this.deps.manager.toggleItem(def, item.path);
                    this.refresh();
                } catch (err) {
                    // Surface errors rather than swallowing silently.
                    console.error("Checklist: toggleItem failed", err);
                }
            });
        } else {
            row.createEl("span", { cls: "checklist-bullet", text: "•" });
        }

        // Name — set via textContent (never innerHTML) to prevent XSS if a
        // filename contains HTML-like characters.
        const nameEl = row.createEl("span", { cls: "checklist-item-name" });
        nameEl.textContent = item.name;

        // Show property values as subtle metadata chips.
        for (const p of def.properties) {
            const v = item.properties[p.key];
            if (v === undefined || v === null || v === "") continue;
            const chip = row.createEl("span", { cls: "checklist-item-prop" });
            chip.textContent = Array.isArray(v) ? v.map(String).join(", ") : String(v);
        }
    }

    private currentState(): ViewState | null {
        if (!this.activeId) return null;
        return this.stateById.get(this.activeId) || null;
    }

    private definition(): ChecklistDefinition | null {
        if (!this.activeId) return null;
        return this.deps.getDefinitions().find((d) => d.id === this.activeId) || null;
    }
}
