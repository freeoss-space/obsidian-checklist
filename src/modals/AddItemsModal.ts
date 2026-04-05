import { App, Modal, Setting, Notice } from "obsidian";
import { PropertyDefinition } from "../models/types";

interface BulkItem {
    name: string;
    properties: Record<string, string | number | boolean>;
    description: string;
}

/**
 * Modal for adding multiple items to a checklist at once.
 * Users can add rows dynamically, fill in properties for each, then submit all at once.
 */
export class AddItemsModal extends Modal {
    private items: BulkItem[] = [];
    private properties: PropertyDefinition[];
    private listContainer: HTMLElement;
    private onSubmit: (items: BulkItem[]) => void;

    constructor(
        app: App,
        properties: PropertyDefinition[],
        onSubmit: (items: BulkItem[]) => void
    ) {
        super(app);
        this.properties = properties;
        this.onSubmit = onSubmit;
        this.addEmptyItem();
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("checklist-modal");

        contentEl.createEl("h2", { text: "Add Multiple Items" });

        this.listContainer = contentEl.createDiv({ cls: "checklist-bulk-items" });
        this.renderItems();

        // Add another item button
        new Setting(contentEl).addButton((button) =>
            button
                .setButtonText("+ Add Another")
                .onClick(() => {
                    this.addEmptyItem();
                    this.renderItems();
                })
        );

        // Submit all
        new Setting(contentEl).addButton((button) =>
            button
                .setButtonText("Add All Items")
                .setCta()
                .onClick(() => {
                    const validItems = this.items.filter((item) => item.name.trim());
                    if (validItems.length === 0) {
                        new Notice("Please enter at least one item name.");
                        return;
                    }
                    this.onSubmit(
                        validItems.map((item) => ({
                            ...item,
                            name: item.name.trim(),
                            description: item.description.trim(),
                        }))
                    );
                    this.close();
                })
        );
    }

    onClose(): void {
        this.contentEl.empty();
    }

    private addEmptyItem(): void {
        const item: BulkItem = { name: "", properties: {}, description: "" };
        for (const prop of this.properties) {
            if (prop.defaultValue !== undefined) {
                item.properties[prop.name] = prop.defaultValue;
            }
        }
        this.items.push(item);
    }

    private renderItems(): void {
        this.listContainer.empty();

        for (let i = 0; i < this.items.length; i++) {
            const item = this.items[i];
            const itemDiv = this.listContainer.createDiv({ cls: "checklist-bulk-item" });

            // Item header with number and remove button
            const header = itemDiv.createDiv({ cls: "checklist-bulk-item-header" });
            header.createSpan({ text: `Item ${i + 1}` });

            if (this.items.length > 1) {
                const removeBtn = header.createEl("button", {
                    text: "Remove",
                    cls: "checklist-btn-remove",
                });
                removeBtn.addEventListener("click", () => {
                    this.items.splice(i, 1);
                    this.renderItems();
                });
            }

            // Name
            new Setting(itemDiv)
                .setName("Name")
                .addText((text) =>
                    text
                        .setPlaceholder("Item name")
                        .setValue(item.name)
                        .onChange((value) => {
                            item.name = value;
                        })
                );

            // Property fields
            for (const prop of this.properties) {
                this.renderPropertyField(itemDiv, prop, item);
            }

            // Description
            new Setting(itemDiv)
                .setName("Description")
                .addTextArea((text) =>
                    text
                        .setPlaceholder("Optional description...")
                        .setValue(item.description)
                        .onChange((value) => {
                            item.description = value;
                        })
                );
        }
    }

    private renderPropertyField(
        container: HTMLElement,
        prop: PropertyDefinition,
        item: BulkItem
    ): void {
        const setting = new Setting(container).setName(prop.name);

        switch (prop.type) {
            case "text":
            case "date":
                setting.addText((text) =>
                    text
                        .setPlaceholder(prop.type === "date" ? "YYYY-MM-DD" : `Enter ${prop.name}`)
                        .setValue(String(item.properties[prop.name] || ""))
                        .onChange((value) => {
                            item.properties[prop.name] = value;
                        })
                );
                break;

            case "number":
                setting.addText((text) =>
                    text
                        .setPlaceholder("0")
                        .setValue(String(item.properties[prop.name] || ""))
                        .onChange((value) => {
                            const num = Number(value);
                            item.properties[prop.name] = isNaN(num) ? value : num;
                        })
                );
                break;

            case "checkbox":
                setting.addToggle((toggle) =>
                    toggle
                        .setValue(Boolean(item.properties[prop.name]))
                        .onChange((value) => {
                            item.properties[prop.name] = value;
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
                        .setValue(String(item.properties[prop.name] || ""))
                        .onChange((value) => {
                            item.properties[prop.name] = value;
                        });
                });
                break;
        }
    }
}
