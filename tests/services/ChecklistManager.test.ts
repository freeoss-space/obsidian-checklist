import { ChecklistManager } from "src/services/ChecklistManager";
import { App, TFile, Vault } from "obsidian";
import {
    ChecklistDefinition,
    ChecklistItem,
    ChecklistPluginSettings,
    DEFAULT_SETTINGS,
    PropertyDefinition,
} from "src/models/types";

describe("ChecklistManager", () => {
    let app: App;
    let manager: ChecklistManager;
    let saveFn: jest.Mock;

    beforeEach(() => {
        app = new App();
        saveFn = jest.fn().mockResolvedValue(undefined);
        manager = new ChecklistManager(
            app,
            { checklists: [], activeChecklistId: null },
            saveFn
        );
    });

    describe("createChecklist", () => {
        it("should create a new checklist definition", async () => {
            const properties: PropertyDefinition[] = [
                { name: "Priority", type: "dropdown", options: ["Low", "Medium", "High"] },
            ];
            const checklist = await manager.createChecklist("My Tasks", properties);

            expect(checklist.name).toBe("My Tasks");
            expect(checklist.folderPath).toBe("checklists/My Tasks");
            expect(checklist.properties).toEqual(properties);
            expect(checklist.id).toBeDefined();
            expect(checklist.createdAt).toBeDefined();
        });

        it("should save the checklist to settings", async () => {
            const checklist = await manager.createChecklist("Tasks", []);
            expect(saveFn).toHaveBeenCalled();
            const settings = manager.getSettings();
            expect(settings.checklists).toHaveLength(1);
            expect(settings.checklists[0].id).toBe(checklist.id);
        });

        it("should create the folder in the vault", async () => {
            const createFolderSpy = jest.spyOn(app.vault, "createFolder");
            await manager.createChecklist("Tasks", []);
            expect(createFolderSpy).toHaveBeenCalledWith("checklists/Tasks");
        });

        it("should set the new checklist as active", async () => {
            const checklist = await manager.createChecklist("Tasks", []);
            expect(manager.getSettings().activeChecklistId).toBe(checklist.id);
        });
    });

    describe("deleteChecklist", () => {
        it("should remove the checklist from settings", async () => {
            const checklist = await manager.createChecklist("Tasks", []);
            await manager.deleteChecklist(checklist.id);
            expect(manager.getSettings().checklists).toHaveLength(0);
        });

        it("should clear activeChecklistId if deleted checklist was active", async () => {
            const checklist = await manager.createChecklist("Tasks", []);
            await manager.deleteChecklist(checklist.id);
            expect(manager.getSettings().activeChecklistId).toBeNull();
        });

        it("should save after deletion", async () => {
            const checklist = await manager.createChecklist("Tasks", []);
            saveFn.mockClear();
            await manager.deleteChecklist(checklist.id);
            expect(saveFn).toHaveBeenCalled();
        });
    });

    describe("addItem", () => {
        it("should create a markdown file with front matter and description", async () => {
            const checklist = await manager.createChecklist("Tasks", [
                { name: "Priority", type: "text" },
            ]);
            const createSpy = jest.spyOn(app.vault, "create");

            await manager.addItem(checklist.id, "Buy groceries", { Priority: "High" }, "Get milk and eggs");

            expect(createSpy).toHaveBeenCalled();
            const [path, content] = createSpy.mock.calls[0];
            expect(path).toBe("checklists/Tasks/Buy groceries.md");
            expect(content).toContain("Priority: High");
            expect(content).toContain("completed: false");
            expect(content).toContain("Get milk and eggs");
        });

        it("should use default values for missing properties", async () => {
            const checklist = await manager.createChecklist("Tasks", [
                { name: "Priority", type: "text", defaultValue: "Medium" },
            ]);
            const createSpy = jest.spyOn(app.vault, "create");

            await manager.addItem(checklist.id, "Task 1", {}, "");

            const [, content] = createSpy.mock.calls[0];
            expect(content).toContain("Priority: Medium");
        });

        it("should throw if checklist not found", async () => {
            await expect(
                manager.addItem("nonexistent", "Task", {}, "")
            ).rejects.toThrow("Checklist not found");
        });
    });

    describe("completeItem", () => {
        it("should delete the file when an item is completed", async () => {
            const checklist = await manager.createChecklist("Tasks", []);
            await manager.addItem(checklist.id, "Task 1", {}, "");

            const deleteSpy = jest.spyOn(app.vault, "delete");

            await manager.completeItem("checklists/Tasks/Task 1.md");

            expect(deleteSpy).toHaveBeenCalled();
            expect(deleteSpy.mock.calls[0][0].path).toBe("checklists/Tasks/Task 1.md");
        });
    });

    describe("getItems", () => {
        it("should return items for a checklist", async () => {
            const checklist = await manager.createChecklist("Tasks", [
                { name: "Priority", type: "text" },
            ]);
            await manager.addItem(checklist.id, "Task 1", { Priority: "High" }, "Description 1");
            await manager.addItem(checklist.id, "Task 2", { Priority: "Low" }, "Description 2");

            const items = await manager.getItems(checklist.id);

            expect(items).toHaveLength(2);
            expect(items[0].name).toBe("Task 1");
            expect(items[0].properties["Priority"]).toBe("High");
            expect(items[0].description).toBe("Description 1");
            expect(items[1].name).toBe("Task 2");
        });

        it("should return empty array for empty checklist", async () => {
            const checklist = await manager.createChecklist("Tasks", []);
            const items = await manager.getItems(checklist.id);
            expect(items).toEqual([]);
        });

        it("should throw if checklist not found", async () => {
            await expect(manager.getItems("nonexistent")).rejects.toThrow("Checklist not found");
        });
    });

    describe("getActiveChecklist", () => {
        it("should return the active checklist", async () => {
            const checklist = await manager.createChecklist("Tasks", []);
            const active = manager.getActiveChecklist();
            expect(active).toBeDefined();
            expect(active?.id).toBe(checklist.id);
        });

        it("should return null when no active checklist", () => {
            const active = manager.getActiveChecklist();
            expect(active).toBeNull();
        });
    });

    describe("setActiveChecklist", () => {
        it("should set a checklist as active", async () => {
            const c1 = await manager.createChecklist("Tasks 1", []);
            const c2 = await manager.createChecklist("Tasks 2", []);
            manager.setActiveChecklist(c1.id);
            expect(manager.getSettings().activeChecklistId).toBe(c1.id);
        });

        it("should save after setting active", async () => {
            const c = await manager.createChecklist("Tasks", []);
            saveFn.mockClear();
            manager.setActiveChecklist(c.id);
            expect(saveFn).toHaveBeenCalled();
        });
    });
});
