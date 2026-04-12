import { ItemView, WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_CHECKLIST_MAIN } from "../constants";
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

export interface ChecklistMainViewDeps {
    manager: ChecklistManager;
    getDefinitions: () => ChecklistDefinition[];
    saveSettings: () => Promise<void>;
    openAddItemModal: (def: ChecklistDefinition) => Promise<void>;
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
 * Main content-area view that renders the items for the active checklist.
 *
 * Layout:
 *   ┌─────────────────────────────────┐
 *   │ [search]  [status]  [+ Add]     │  ← toolbar
 *   ├─────────────────────────────────┤
 *   │  ☐  Apple                       │
 *   │  ☐  Banana          Author      │  ← scrollable list
 *   │  ✓  Cherry                      │
 *   └─────────────────────────────────┘
 */
export class ChecklistMainView extends ItemView {
    private deps: ChecklistMainViewDeps;
    private activeId: string | null = null;
    private stateById = new Map<string, ViewState>();
    private toolbarEl!: HTMLElement;
    private listEl!: HTMLElement;
    private searchInput!: HTMLInputElement;
    private statusSelect!: HTMLSelectElement;

    constructor(leaf: WorkspaceLeaf, deps: ChecklistMainViewDeps) {
        super(leaf);
        this.deps = deps;
    }

    getViewType(): string {
        return VIEW_TYPE_CHECKLIST_MAIN;
    }

    getDisplayText(): string {
        const def = this.definition();
        return def ? def.name : "Checklist";
    }

    getIcon(): string {
        return "check-square";
    }

    async onOpen(): Promise<void> {
        const root = this.contentEl;
        root.empty();
        root.addClass("checklist-main-root");

        this.toolbarEl = root.createDiv({ cls: "checklist-toolbar" });
        this.listEl = root.createDiv({ cls: "checklist-list" });

        if (!this.activeId) {
            this.renderEmpty();
            return;
        }

        this.renderToolbar();
        await this.loadAndRender();
    }

    async onClose(): Promise<void> {
        this.contentEl.empty();
    }

    /** Switch to a different checklist (called from the sidebar or plugin). */
    async selectChecklist(id: string): Promise<void> {
        this.activeId = id;
        if (!this.stateById.has(id)) this.stateById.set(id, defaultViewState());
        const def = this.definition();
        if (!def) {
            this.renderEmptyList();
            return;
        }
        this.renderToolbar();
        await this.loadAndRender();
    }

    /** Re-render only the list portion (called on filter/sort changes or vault events). */
    refresh(): void {
        if (!this.activeId) return;
        this.renderList();
    }

    // ----- private rendering -----

    private async loadAndRender(): Promise<void> {
        const def = this.definition();
        if (!def) return;
        await this.deps.manager.loadItems(def);
        this.renderList();
    }

    private renderEmpty(): void {
        this.listEl.empty();
        this.listEl.createDiv({
            cls: "checklist-empty",
            text: "No checklists yet. Open the sidebar and click '+ New list' to create one.",
        });
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
            st.filter = {
                ...st.filter,
                status: this.statusSelect.value as FilterOptions["status"],
            };
            this.refresh();
        });

        const addBtn = this.toolbarEl.createEl("button", {
            text: "+ Add",
            cls: "checklist-add",
        });
        addBtn.addEventListener("click", () => {
            const def = this.definition();
            if (def) void this.deps.openAddItemModal(def);
        });
    }

    private renderEmptyList(): void {
        this.listEl.empty();
        this.listEl.createDiv({
            cls: "checklist-empty",
            text: "No items match your filters.",
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
            this.listEl.createDiv({
                cls: "checklist-empty",
                text: "No items match your filters.",
            });
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
                    console.error("Checklist: toggleItem failed", err);
                }
            });
        } else {
            row.createEl("span", { cls: "checklist-bullet", text: "•" });
        }

        // Name — set via textContent (never innerHTML) to prevent XSS.
        const nameEl = row.createEl("span", { cls: "checklist-item-name" });
        nameEl.textContent = item.name;

        // Show property values as metadata chips.
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
