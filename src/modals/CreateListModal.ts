import { App, Modal, Setting, Notice } from "obsidian";
import { ChecklistKind, PropertyDefinition, PropertyType } from "../models/types";

/**
 * Modal for creating a new checklist.
 * Asks for a name and property definitions (which become front matter fields).
 */
export class CreateListModal extends Modal {
    private listName: string = "";
    private kind: ChecklistKind = "checklist";
    private inlineAddMode: "simple" | "form" = "simple";
    private properties: PropertyDefinition[] = [];
    private onSubmit: (
        name: string,
        properties: PropertyDefinition[],
        kind: ChecklistKind,
        inlineAddMode: "simple" | "form"
    ) => void;

    constructor(
        app: App,
        onSubmit: (
            name: string,
            properties: PropertyDefinition[],
            kind: ChecklistKind,
            inlineAddMode: "simple" | "form"
        ) => void
    ) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("checklist-modal");

        contentEl.createEl("h2", { text: "Create New List" });

        // Kind picker
        new Setting(contentEl)
            .setName("Kind")
            .setDesc("Checklist tracks completion with checkboxes; list omits checkboxes (use as a properties catalogue).")
            .addDropdown((dropdown) =>
                dropdown
                    .addOption("checklist", "Checklist (with checkboxes)")
                    .addOption("list", "List (no checkboxes)")
                    .setValue(this.kind)
                    .onChange((value) => {
                        this.kind = value as ChecklistKind;
                    })
            );

        // List name
        new Setting(contentEl)
            .setName("Name")
            .setDesc("Name for the new list")
            .addText((text) =>
                text
                    .setPlaceholder("My Tasks")
                    .onChange((value) => {
                        this.listName = value;
                    })
            );

        // Properties section
        contentEl.createEl("h3", { text: "Properties" });
        contentEl.createEl("p", {
            text: "Define the front matter fields for each item in this checklist.",
            cls: "setting-item-description",
        });

        const propertiesContainer = contentEl.createDiv({ cls: "checklist-properties-list" });

        this.renderProperties(propertiesContainer);

        // Add property button
        new Setting(contentEl).addButton((button) =>
            button.setButtonText("Add Property").onClick(() => {
                this.properties.push({
                    name: "",
                    type: "text",
                });
                this.renderProperties(propertiesContainer);
            })
        );

        new Setting(contentEl)
            .setName("Inline add mode")
            .setDesc("Simple uses only name. Form includes description and properties.")
            .addDropdown((dropdown) =>
                dropdown
                    .addOption("simple", "Simple")
                    .addOption("form", "Form")
                    .setValue(this.inlineAddMode)
                    .onChange((value) => {
                        this.inlineAddMode = value as "simple" | "form";
                    })
            );

        // Submit
        new Setting(contentEl).addButton((button) =>
            button
                .setButtonText("Create")
                .setCta()
                .onClick(() => {
                    if (!this.listName.trim()) {
                        new Notice("Please enter a name.");
                        return;
                    }
                    // Filter out empty property names
                    const validProps = this.properties.filter((p) => p.name.trim());
                    this.onSubmit(this.listName.trim(), validProps, this.kind, this.inlineAddMode);
                    this.close();
                })
        );
    }

    onClose(): void {
        this.contentEl.empty();
    }

    /**
     * Renders the list of property definition inputs.
     */
    private renderProperties(container: HTMLElement): void {
        container.empty();

        this.properties.forEach((prop, index) => {
            const row = container.createDiv({ cls: "checklist-property-row" });

            // Property name
            new Setting(row)
                .setName(`Property ${index + 1}`)
                .addText((text) =>
                    text
                        .setPlaceholder("Property name")
                        .setValue(prop.name)
                        .onChange((value) => {
                            this.properties[index].name = value;
                        })
                )
                .addDropdown((dropdown) =>
                    dropdown
                        .addOption("text", "Text")
                        .addOption("number", "Number")
                        .addOption("date", "Date")
                        .addOption("checkbox", "Checkbox")
                        .addOption("dropdown", "Dropdown")
                        .setValue(prop.type)
                        .onChange((value) => {
                            this.properties[index].type = value as PropertyType;
                            this.renderProperties(container);
                        })
                )
                .addButton((button) =>
                    button
                        .setIcon("trash")
                        .setWarning()
                        .onClick(() => {
                            this.properties.splice(index, 1);
                            this.renderProperties(container);
                        })
                );

            // Default value
            new Setting(row)
                .setName("Default value")
                .addText((text) =>
                    text
                        .setPlaceholder("Optional default")
                        .setValue(prop.defaultValue || "")
                        .onChange((value) => {
                            this.properties[index].defaultValue = value || undefined;
                        })
                );

            // Dropdown options (only if type is dropdown)
            if (prop.type === "dropdown") {
                new Setting(row)
                    .setName("Options")
                    .setDesc("Comma-separated values")
                    .addText((text) =>
                        text
                            .setPlaceholder("Option1, Option2, Option3")
                            .setValue((prop.options || []).join(", "))
                            .onChange((value) => {
                                this.properties[index].options = value
                                    .split(",")
                                    .map((s) => s.trim())
                                    .filter(Boolean);
                            })
                    );
            }
        });
    }
}
