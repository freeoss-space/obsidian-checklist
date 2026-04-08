import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type ChecklistPlugin from "../main";
import { DEFAULT_CHECKLISTS_FOLDER } from "../models/types";

/**
 * Settings tab for the Checklist plugin.
 */
export class ChecklistSettingTab extends PluginSettingTab {
    plugin: ChecklistPlugin;

    constructor(app: App, plugin: ChecklistPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        let pendingFolder = this.plugin.settings.checklistsFolder;

        new Setting(containerEl)
            .setName("Checklists folder")
            .setDesc(
                "The main folder where checklists are stored. New checklists will be created as subfolders of this folder."
            )
            .addText((text) =>
                text
                    .setPlaceholder(DEFAULT_CHECKLISTS_FOLDER)
                    .setValue(this.plugin.settings.checklistsFolder)
                    .onChange((value) => {
                        pendingFolder = value;
                    })
            )
            .addButton((button) =>
                button
                    .setButtonText("Save")
                    .setCta()
                    .onClick(async () => {
                        const previousFolder = this.plugin.settings.checklistsFolder;
                        const trimmed = pendingFolder.trim().replace(/^\/+|\/+$/g, "");
                        this.plugin.settings.checklistsFolder =
                            trimmed || DEFAULT_CHECKLISTS_FOLDER;
                        await this.plugin.saveSettings();
                        if (
                            this.plugin.settings.checklistsFolder !== previousFolder &&
                            typeof (this.plugin as any).onChecklistsFolderUpdated === "function"
                        ) {
                            await (this.plugin as any).onChecklistsFolderUpdated();
                        }
                        new Notice("Checklists folder saved.");
                    })
            );
    }
}
