import { App, Modal, Setting, Notice } from "obsidian";
import { PropertyDefinition } from "../models/types";

/**
 * Modal for adding a new item to a checklist.
 * Shows fields for name, each defined property, and a description.
 */
export class AddItemModal extends Modal {
    private itemName: string = "";
    private propertyValues: Record<string, string | number | boolean> = {};
    private description: string = "";
    private properties: PropertyDefinition[];
    private onSubmit: (
        name: string,
        properties: Record<string, string | number | boolean>,
        description: string
    ) => void;

    constructor(
        app: App,
        properties: PropertyDefinition[],
        onSubmit: (
            name: string,
            properties: Record<string, string | number | boolean>,
            description: string
        ) => void
    ) {
        super(app);
        this.properties = properties;
        this.onSubmit = onSubmit;

        // Initialize with defaults
        for (const prop of properties) {
            if (prop.defaultValue !== undefined) {
                this.propertyValues[prop.name] = prop.defaultValue;
            }
        }
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("checklist-modal");

        contentEl.createEl("h2", { text: "Add New Item" });

        // Item name
        new Setting(contentEl)
            .setName("Name")
            .setDesc("Name for the checklist item (also the filename)")
            .addText((text) =>
                text
                    .setPlaceholder("Item name")
                    .onChange((value) => {
                        this.itemName = value;
                    })
            );

        // Property fields
        if (this.properties.length > 0) {
            contentEl.createEl("h3", { text: "Properties" });
        }

        for (const prop of this.properties) {
            this.renderPropertyField(contentEl, prop);
        }

        // Description
        new Setting(contentEl)
            .setName("Description")
            .setDesc("Optional description for the item")
            .addTextArea((text) =>
                text
                    .setPlaceholder("Enter a description...")
                    .onChange((value) => {
                        this.description = value;
                    })
            );

        // Submit
        new Setting(contentEl).addButton((button) =>
            button
                .setButtonText("Add Item")
                .setCta()
                .onClick(() => {
                    if (!this.itemName.trim()) {
                        new Notice("Please enter an item name.");
                        return;
                    }
                    this.onSubmit(
                        this.itemName.trim(),
                        { ...this.propertyValues },
                        this.description.trim()
                    );
                    this.close();
                })
        );
    }

    onClose(): void {
        this.contentEl.empty();
    }

    /**
     * Renders an input field for a single property based on its type.
     */
    private renderPropertyField(container: HTMLElement, prop: PropertyDefinition): void {
        const setting = new Setting(container).setName(prop.name);

        switch (prop.type) {
            case "date":
                setting.addText((text) => {
                    text.inputEl.type = "date";
                    text
                        .setValue(String(this.propertyValues[prop.name] || ""))
                        .onChange((value) => {
                            this.propertyValues[prop.name] = value;
                        });
                });
                break;

            case "text":
                setting.addText((text) =>
                    text
                        .setPlaceholder(`Enter ${prop.name}`)
                        .setValue(String(this.propertyValues[prop.name] || ""))
                        .onChange((value) => {
                            this.propertyValues[prop.name] = value;
                        })
                );
                break;

            case "number":
                setting.addText((text) =>
                    text
                        .setPlaceholder("0")
                        .setValue(String(this.propertyValues[prop.name] || ""))
                        .onChange((value) => {
                            const num = Number(value);
                            this.propertyValues[prop.name] = isNaN(num) ? value : num;
                        })
                );
                break;

            case "checkbox":
                setting.addToggle((toggle) =>
                    toggle
                        .setValue(Boolean(this.propertyValues[prop.name]))
                        .onChange((value) => {
                            this.propertyValues[prop.name] = value;
                        })
                );
                break;

            case "dropdown":
                setting.addDropdown((dropdown) => {
                    dropdown.addOption("", `Select ${prop.name}...`);
                    for (const option of prop.options || []) {
                        dropdown.addOption(option, option);
                    }
                    dropdown
                        .setValue(String(this.propertyValues[prop.name] || ""))
                        .onChange((value) => {
                            this.propertyValues[prop.name] = value;
                        });
                });
                break;
        }
    }
}
