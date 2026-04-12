import { App, Modal } from "obsidian";
import type { ChecklistDefinition, ChecklistKind } from "../core/types";

export interface CreateListModalOptions {
    /** Vault-relative folder prefix for newly created lists. May be empty. */
    defaultFolder: string;
}

/**
 * Accepts user input for a new checklist and hands a fully-formed
 * {@link ChecklistDefinition} to the caller. Validation happens in the
 * modal itself — never writes to the vault.
 *
 * Security posture:
 *  - Name is constrained to `SAFE_NAME_RE`. Control chars, traversal
 *    segments, path separators, and reserved names are rejected.
 *  - All user-visible text is written via `textContent` / attribute
 *    setters — never `innerHTML` — so an injected `<img onerror>` stays
 *    inert text.
 *  - The default folder prefix is normalized to strip trailing slashes
 *    and the joined result never exceeds `MAX_FOLDER_LEN` characters.
 *
 * Performance posture:
 *  - Single DOM pass on open, no timers, no observers. Close drops all
 *    listeners with the node.
 */
const SAFE_NAME_RE = /^[^\\/\x00-\x1f<>:"|?*]{1,120}$/;
const RESERVED = new Set([".", "..", ""]);
const MAX_FOLDER_LEN = 240;

export function slugify(raw: string): string {
    return raw
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

/** Normalize a user-supplied folder: trim, collapse trailing slashes. */
export function normalizeFolder(raw: string): string {
    return raw.replace(/\/+$/, "").trim();
}

/** Validate a folder path — throws on any unsafe input. */
export function assertSafeFolder(folder: string): void {
    if (folder === "") return; // empty is allowed (vault root)
    if (folder.length > MAX_FOLDER_LEN) throw new Error("Folder path is too long");
    if (/[\x00-\x1f]/.test(folder)) throw new Error("Folder contains control characters");
    const segments = folder.split("/");
    for (const seg of segments) {
        if (RESERVED.has(seg)) throw new Error("Folder contains an invalid segment");
        if (seg === "..") throw new Error("Folder traversal is not allowed");
        if (!SAFE_NAME_RE.test(seg)) throw new Error("Folder contains unsafe characters");
    }
}

/** Validate a user-entered checklist display name — throws on bad input. */
export function assertSafeChecklistName(name: string): void {
    const trimmed = name.trim();
    if (trimmed.length === 0) throw new Error("Name is required");
    if (trimmed.length > 120) throw new Error("Name is too long");
    if (!SAFE_NAME_RE.test(trimmed)) {
        throw new Error("Name contains unsupported characters");
    }
    if (RESERVED.has(trimmed) || trimmed.includes("..")) {
        throw new Error("Name is not allowed");
    }
}

export type CreateListSubmit = (def: ChecklistDefinition) => void | Promise<void>;

export class CreateListModal extends Modal {
    private options: CreateListModalOptions;
    private onSubmit: CreateListSubmit;
    private nameInput!: HTMLInputElement;
    private kindSelect!: HTMLSelectElement;
    private errorEl!: HTMLElement;
    private submitBtn!: HTMLButtonElement;
    private busy = false;
    /** Lifecycle flag toggled by onOpen/onClose. Test-visible. */
    public isOpen = false;

    constructor(app: App, options: CreateListModalOptions, onSubmit: CreateListSubmit) {
        super(app);
        this.options = options;
        this.onSubmit = onSubmit;
    }

    onOpen(): void {
        this.isOpen = true;
        this.titleEl.textContent = "Create a new checklist";
        const c = this.contentEl;
        c.empty();
        c.addClass("create-list-modal");

        // Name row
        const nameRow = c.createDiv({ cls: "create-list-row" });
        nameRow.createEl("label", { text: "Name", cls: "create-list-label" });
        this.nameInput = nameRow.createEl("input", {
            cls: "create-list-name",
            attr: { type: "text", placeholder: "e.g. Reading list", maxlength: "120" },
        });

        // Kind row
        const kindRow = c.createDiv({ cls: "create-list-row" });
        kindRow.createEl("label", { text: "Kind", cls: "create-list-label" });
        this.kindSelect = kindRow.createEl("select", { cls: "create-list-kind" });
        this.kindSelect.createEl("option", { text: "Checklist (with checkboxes)", attr: { value: "checklist" } });
        this.kindSelect.createEl("option", { text: "List (bullets only)", attr: { value: "list" } });

        // Error region — empty by default
        this.errorEl = c.createDiv({ cls: "create-list-error" });
        this.errorEl.setAttribute("role", "alert");

        // Actions row
        const actions = c.createDiv({ cls: "create-list-actions" });
        const cancelBtn = actions.createEl("button", {
            text: "Cancel",
            cls: "create-list-cancel",
            attr: { type: "button" },
        });
        cancelBtn.addEventListener("click", () => this.close());

        this.submitBtn = actions.createEl("button", {
            text: "Create",
            cls: ["create-list-submit", "mod-cta"],
            attr: { type: "button" },
        });
        this.submitBtn.addEventListener("click", () => {
            void this.handleSubmit();
        });

        // Enter-to-submit from the name input.
        this.nameInput.addEventListener("keydown", (evt) => {
            if (evt.key === "Enter") {
                evt.preventDefault();
                void this.handleSubmit();
            }
        });

        // Focus the name field for fast input.
        queueMicrotask(() => this.nameInput.focus());
    }

    onClose(): void {
        this.isOpen = false;
    }

    private showError(message: string): void {
        // textContent only — never innerHTML.
        this.errorEl.textContent = message;
    }

    private clearError(): void {
        this.errorEl.textContent = "";
    }

    private async handleSubmit(): Promise<void> {
        if (this.busy) return;
        this.busy = true;
        try {
            const rawName = this.nameInput.value ?? "";
            const trimmed = rawName.trim();
            try {
                assertSafeChecklistName(trimmed);
            } catch (err) {
                this.showError((err as Error).message);
                return;
            }
            const kind = (this.kindSelect.value === "list" ? "list" : "checklist") as ChecklistKind;
            const id = slugify(trimmed);
            if (id.length === 0) {
                this.showError("Name must contain at least one letter or digit");
                return;
            }
            const prefix = normalizeFolder(this.options.defaultFolder || "");
            try {
                assertSafeFolder(prefix);
            } catch (err) {
                this.showError(`Default folder is invalid: ${(err as Error).message}`);
                return;
            }
            const folder = prefix === "" ? trimmed : `${prefix}/${trimmed}`;
            if (folder.length > MAX_FOLDER_LEN) {
                this.showError("Folder path is too long");
                return;
            }
            const def: ChecklistDefinition = {
                id,
                name: trimmed,
                kind,
                folder,
                properties: [],
            };
            this.clearError();
            try {
                await this.onSubmit(def);
            } catch (err) {
                this.showError((err as Error).message);
                return;
            }
            this.close();
        } finally {
            this.busy = false;
        }
    }
}
