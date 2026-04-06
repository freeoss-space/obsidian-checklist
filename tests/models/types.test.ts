import {
    DEFAULT_SETTINGS,
    ChecklistDefinition,
    ChecklistItem,
    PropertyDefinition,
    ChecklistPluginSettings,
} from "src/models/types";

describe("types", () => {
    describe("DEFAULT_SETTINGS", () => {
        it("should have empty checklists array", () => {
            expect(DEFAULT_SETTINGS.checklists).toEqual([]);
        });

        it("should have null activeChecklistId", () => {
            expect(DEFAULT_SETTINGS.activeChecklistId).toBeNull();
        });
    });

    describe("ChecklistDefinition", () => {
        it("should accept a valid definition", () => {
            const def: ChecklistDefinition = {
                id: "abc-123",
                name: "My Tasks",
                folderPath: "checklists/my-tasks",
                properties: [
                    { name: "Priority", type: "dropdown", options: ["Low", "Medium", "High"] },
                    { name: "Due Date", type: "date" },
                ],
                createdAt: "2026-01-01T00:00:00.000Z",
                kind: "checklist",
            };
            expect(def.id).toBe("abc-123");
            expect(def.properties).toHaveLength(2);
            expect(def.properties[0].options).toContain("High");
        });
    });

    describe("ChecklistItem", () => {
        it("should represent a parsed item", () => {
            const item: ChecklistItem = {
                filePath: "checklists/my-tasks/item1.md",
                name: "Buy groceries",
                description: "Get milk, eggs, bread",
                properties: { Priority: "High", "Due Date": "2026-04-05" },
                completed: false,
            };
            expect(item.completed).toBe(false);
            expect(item.properties["Priority"]).toBe("High");
        });
    });

    describe("PropertyDefinition", () => {
        it("should support default values", () => {
            const prop: PropertyDefinition = {
                name: "Status",
                type: "text",
                defaultValue: "Pending",
            };
            expect(prop.defaultValue).toBe("Pending");
        });
    });
});
