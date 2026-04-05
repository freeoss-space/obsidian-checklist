import { App, Modal, Setting, Notice } from "obsidian";
import { ChecklistManager } from "../services/ChecklistManager";
import { ChecklistDefinition } from "../models/types";

/**
 * Modal for adding shared text as an item to a checklist.
 * Opened via the mobile share intent or the obsidian:// protocol handler.
 */
export class ShareToChecklistModal extends Modal {
    private manager: ChecklistManager;
    private onItemAdded: (checklistId: string) => void;
    private sharedText: string;
    private itemName: string = "";
    private description: string = "";
    private selectedChecklistId: string = "";

    constructor(
        app: App,
        manager: ChecklistManager,
        sharedText: string,
        onItemAdded: (checklistId: string) => void
    ) {
        super(app);
        this.manager = manager;
        this.sharedText = sharedText;
        this.onItemAdded = onItemAdded;

        // Use first line as item name, rest as description
        const lines = sharedText.trim().split("\n");
        this.itemName = lines[0]?.trim() || "";
        this.description = lines.slice(1).join("\n").trim();

        // Default to active checklist
        const activeId = this.manager.getSettings().activeChecklistId;
        if (activeId) {
            this.selectedChecklistId = activeId;
        }
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("checklist-modal");

        contentEl.createEl("h2", { text: "Add to Checklist" });

        const checklists = this.manager.getSettings().checklists;

        if (checklists.length === 0) {
            contentEl.createEl("p", {
                text: "No checklists found. Create one first.",
            });
            return;
        }

        // Checklist picker
        new Setting(contentEl)
            .setName("Checklist")
            .setDesc("Select the checklist to add the item to")
            .addDropdown((dropdown) => {
                dropdown.addOption("", "Select a checklist...");
                for (const cl of checklists) {
                    dropdown.addOption(cl.id, cl.name);
                }
                dropdown
                    .setValue(this.selectedChecklistId)
                    .onChange((value) => {
                        this.selectedChecklistId = value;
                    });
            });

        // Item name
        new Setting(contentEl)
            .setName("Name")
            .setDesc("Name for the checklist item")
            .addText((text) =>
                text
                    .setPlaceholder("Item name")
                    .setValue(this.itemName)
                    .onChange((value) => {
                        this.itemName = value;
                    })
            );

        // Description
        new Setting(contentEl)
            .setName("Description")
            .setDesc("Optional description for the item")
            .addTextArea((text) =>
                text
                    .setPlaceholder("Enter a description...")
                    .setValue(this.description)
                    .onChange((value) => {
                        this.description = value;
                    })
            );

        // Submit
        new Setting(contentEl).addButton((button) =>
            button
                .setButtonText("Add to Checklist")
                .setCta()
                .onClick(async () => {
                    if (!this.selectedChecklistId) {
                        new Notice("Please select a checklist.");
                        return;
                    }
                    if (!this.itemName.trim()) {
                        new Notice("Please enter an item name.");
                        return;
                    }
                    await this.manager.addItem(
                        this.selectedChecklistId,
                        this.itemName.trim(),
                        {},
                        this.description.trim()
                    );
                    new Notice(`Item "${this.itemName.trim()}" added.`);
                    this.onItemAdded(this.selectedChecklistId);
                    this.close();
                })
        );
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
