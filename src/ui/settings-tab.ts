import { App, Notice, PluginSettingTab } from "obsidian";
import type ChecklistPlugin from "../main";
import { assertSafeFolder, normalizeFolder } from "./create-list-modal";

/**
 * Plugin settings tab. Keeps a pending value in a local buffer and only
 * commits it to plugin settings on an explicit Save click — per the
 * user's "with a save button" requirement.
 *
 * Security posture:
 *  - Reuses {@link assertSafeFolder} so the same hard gates used at
 *    checklist-creation time are enforced here: no traversal, no
 *    control characters, no reserved segments.
 *  - Error messages are written via `textContent` — never innerHTML —
 *    so hostile input cannot escape the DOM.
 */
export class ChecklistSettingTab extends PluginSettingTab {
    private plugin: ChecklistPlugin;
    private pendingFolder = "";
    private inputEl: HTMLInputElement | null = null;
    private errorEl: HTMLElement | null = null;
    private statusEl: HTMLElement | null = null;

    constructor(app: App, plugin: ChecklistPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.addClass("checklist-settings");

        containerEl.createEl("h2", { text: "Checklist settings" });

        const section = containerEl.createDiv({ cls: "checklist-settings-folder" });
        section.createEl("label", {
            text: "Default checklist folder",
            cls: "checklist-settings-label",
        });
        section.createEl("div", {
            text: "Vault-relative folder where new checklists are created. Leave empty to use the vault root.",
            cls: "checklist-settings-desc",
        });

        this.pendingFolder = this.plugin.settings.defaultFolder ?? "";
        this.inputEl = section.createEl("input", {
            cls: "checklist-default-folder",
            attr: {
                type: "text",
                placeholder: "Checklists",
                maxlength: "240",
                spellcheck: "false",
            },
        });
        this.inputEl.value = this.pendingFolder;
        this.inputEl.addEventListener("input", () => {
            this.pendingFolder = this.inputEl?.value ?? "";
            this.clearError();
        });

        this.errorEl = section.createEl("div", { cls: "checklist-settings-error" });
        this.errorEl.setAttribute("role", "alert");
        this.statusEl = section.createEl("div", { cls: "checklist-settings-status" });
        this.statusEl.setAttribute("role", "status");

        const actions = section.createDiv({ cls: "checklist-settings-actions" });
        const saveBtn = actions.createEl("button", {
            text: "Save",
            cls: ["checklist-settings-save", "mod-cta"],
            attr: { type: "button" },
        });
        saveBtn.addEventListener("click", () => {
            void this.handleSave();
        });
    }

    private showError(message: string): void {
        if (!this.errorEl) return;
        this.errorEl.textContent = message;
        if (this.statusEl) this.statusEl.textContent = "";
    }

    private clearError(): void {
        if (this.errorEl) this.errorEl.textContent = "";
    }

    private async handleSave(): Promise<void> {
        const normalized = normalizeFolder(this.pendingFolder);
        try {
            assertSafeFolder(normalized);
        } catch (err) {
            this.showError((err as Error).message);
            return;
        }
        try {
            await this.plugin.setDefaultFolder(normalized);
        } catch (err) {
            this.showError((err as Error).message);
            return;
        }
        this.clearError();
        if (this.inputEl) this.inputEl.value = normalized;
        if (this.statusEl) this.statusEl.textContent = "Saved.";
        new Notice("Checklist settings saved");
    }
}
