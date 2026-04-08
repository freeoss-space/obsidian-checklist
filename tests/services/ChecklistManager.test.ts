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

        it("should delete all items in the checklist folder", async () => {
            const checklist = await manager.createChecklist("Tasks", []);
            await manager.addItem(checklist.id, "Task 1", {}, "");
            await manager.addItem(checklist.id, "Task 2", {}, "");

            const deleteSpy = jest.spyOn(app.vault, "delete");
            await manager.deleteChecklist(checklist.id);

            // Should have deleted both item files
            const deletedPaths = deleteSpy.mock.calls.map((c) => c[0].path);
            expect(deletedPaths).toContain("checklists/Tasks/Task 1.md");
            expect(deletedPaths).toContain("checklists/Tasks/Task 2.md");
        });

        it("should not delete files from other checklists", async () => {
            const c1 = await manager.createChecklist("Tasks", []);
            const c2 = await manager.createChecklist("Other", []);
            await manager.addItem(c1.id, "Task 1", {}, "");
            await manager.addItem(c2.id, "Other 1", {}, "");

            const deleteSpy = jest.spyOn(app.vault, "delete");
            await manager.deleteChecklist(c1.id);

            const deletedPaths = deleteSpy.mock.calls.map((c) => c[0].path);
            expect(deletedPaths).toContain("checklists/Tasks/Task 1.md");
            expect(deletedPaths).not.toContain("checklists/Other/Other 1.md");
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

    describe("deleteItem", () => {
        it("should delete the file for an item", async () => {
            const checklist = await manager.createChecklist("Tasks", []);
            await manager.addItem(checklist.id, "Task 1", {}, "");

            const deleteSpy = jest.spyOn(app.vault, "delete");
            await manager.deleteItem("checklists/Tasks/Task 1.md");

            expect(deleteSpy).toHaveBeenCalled();
            expect(deleteSpy.mock.calls[0][0].path).toBe("checklists/Tasks/Task 1.md");
        });

        it("should remove the file from vault so getItems no longer returns it", async () => {
            const checklist = await manager.createChecklist("Tasks", []);
            await manager.addItem(checklist.id, "Task 1", {}, "");
            await manager.addItem(checklist.id, "Task 2", {}, "");

            await manager.deleteItem("checklists/Tasks/Task 1.md");

            const items = await manager.getItems(checklist.id);
            expect(items).toHaveLength(1);
            expect(items[0].name).toBe("Task 2");
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

    describe("addItems", () => {
        it("should create multiple items at once", async () => {
            const checklist = await manager.createChecklist("Tasks", [
                { name: "Priority", type: "text" },
            ]);
            const createSpy = jest.spyOn(app.vault, "create");

            const items = [
                { name: "Task 1", properties: { Priority: "High" }, description: "First" },
                { name: "Task 2", properties: { Priority: "Low" }, description: "Second" },
                { name: "Task 3", properties: {}, description: "" },
            ];

            const files = await manager.addItems(checklist.id, items);

            expect(files).toHaveLength(3);
            expect(createSpy).toHaveBeenCalledTimes(3);
        });

        it("should create correct files for each item", async () => {
            const checklist = await manager.createChecklist("Tasks", [
                { name: "Priority", type: "text" },
            ]);
            const createSpy = jest.spyOn(app.vault, "create");

            await manager.addItems(checklist.id, [
                { name: "Buy milk", properties: { Priority: "High" }, description: "From store" },
                { name: "Walk dog", properties: { Priority: "Low" }, description: "" },
            ]);

            const [path1, content1] = createSpy.mock.calls[0];
            expect(path1).toBe("checklists/Tasks/Buy milk.md");
            expect(content1).toContain("Priority: High");
            expect(content1).toContain("From store");

            const [path2, content2] = createSpy.mock.calls[1];
            expect(path2).toBe("checklists/Tasks/Walk dog.md");
            expect(content2).toContain("Priority: Low");
        });

        it("should apply default values for missing properties", async () => {
            const checklist = await manager.createChecklist("Tasks", [
                { name: "Priority", type: "text", defaultValue: "Medium" },
            ]);
            const createSpy = jest.spyOn(app.vault, "create");

            await manager.addItems(checklist.id, [
                { name: "Task 1", properties: {}, description: "" },
            ]);

            const [, content] = createSpy.mock.calls[0];
            expect(content).toContain("Priority: Medium");
        });

        it("should throw if checklist not found", async () => {
            await expect(
                manager.addItems("nonexistent", [{ name: "Task", properties: {}, description: "" }])
            ).rejects.toThrow("Checklist not found");
        });

        it("should return empty array for empty input", async () => {
            const checklist = await manager.createChecklist("Tasks", []);
            const files = await manager.addItems(checklist.id, []);
            expect(files).toEqual([]);
        });
    });

    describe("exportChecklistAsMarkdown", () => {
        it("should export a checklist as a markdown string with task items", async () => {
            const checklist = await manager.createChecklist("Tasks", [
                { name: "Priority", type: "text" },
            ]);
            await manager.addItem(checklist.id, "Buy milk", { Priority: "High" }, "From the store");
            await manager.addItem(checklist.id, "Walk dog", { Priority: "Low" }, "");

            const md = await manager.exportChecklistAsMarkdown(checklist.id);

            expect(md).toContain("# Tasks");
            expect(md).toContain("- [ ] Buy milk");
            expect(md).toContain("Priority: High");
            expect(md).toContain("From the store");
            expect(md).toContain("- [ ] Walk dog");
            expect(md).toContain("Priority: Low");
        });

        it("should export an empty checklist with just the heading", async () => {
            const checklist = await manager.createChecklist("Empty", []);

            const md = await manager.exportChecklistAsMarkdown(checklist.id);

            expect(md).toContain("# Empty");
            expect(md).not.toContain("- [ ]");
        });

        it("should throw if checklist not found", async () => {
            await expect(
                manager.exportChecklistAsMarkdown("nonexistent")
            ).rejects.toThrow("Checklist not found");
        });
    });

    describe("exportChecklistAsJson", () => {
        it("should export a checklist as a JSON string with items", async () => {
            const checklist = await manager.createChecklist("Tasks", [
                { name: "Priority", type: "text" },
            ]);
            await manager.addItem(checklist.id, "Buy milk", { Priority: "High" }, "From store");

            const jsonStr = await manager.exportChecklistAsJson(checklist.id);
            const parsed = JSON.parse(jsonStr);

            expect(parsed.name).toBe("Tasks");
            expect(parsed.items).toHaveLength(1);
            expect(parsed.items[0].name).toBe("Buy milk");
            expect(parsed.items[0].properties.Priority).toBe("High");
            expect(parsed.items[0].description).toBe("From store");
        });

        it("should include checklist properties definition in JSON", async () => {
            const checklist = await manager.createChecklist("Tasks", [
                { name: "Priority", type: "dropdown", options: ["Low", "High"] },
            ]);

            const jsonStr = await manager.exportChecklistAsJson(checklist.id);
            const parsed = JSON.parse(jsonStr);

            expect(parsed.properties).toHaveLength(1);
            expect(parsed.properties[0].name).toBe("Priority");
            expect(parsed.properties[0].type).toBe("dropdown");
        });

        it("should throw if checklist not found", async () => {
            await expect(
                manager.exportChecklistAsJson("nonexistent")
            ).rejects.toThrow("Checklist not found");
        });
    });

    describe("exportAllAsMarkdown", () => {
        it("should export all checklists in one markdown string", async () => {
            const c1 = await manager.createChecklist("Tasks", []);
            const c2 = await manager.createChecklist("Shopping", []);
            await manager.addItem(c1.id, "Task 1", {}, "");
            await manager.addItem(c2.id, "Apples", {}, "");

            const md = await manager.exportAllAsMarkdown();

            expect(md).toContain("# Tasks");
            expect(md).toContain("- [ ] Task 1");
            expect(md).toContain("# Shopping");
            expect(md).toContain("- [ ] Apples");
        });

        it("should return empty string when no checklists exist", async () => {
            const md = await manager.exportAllAsMarkdown();
            expect(md).toBe("");
        });
    });

    describe("exportAllAsJson", () => {
        it("should export all checklists as a JSON string", async () => {
            const c1 = await manager.createChecklist("Tasks", []);
            const c2 = await manager.createChecklist("Shopping", []);
            await manager.addItem(c1.id, "Task 1", {}, "");
            await manager.addItem(c2.id, "Apples", {}, "");

            const jsonStr = await manager.exportAllAsJson();
            const parsed = JSON.parse(jsonStr);

            expect(parsed.checklists).toHaveLength(2);
            expect(parsed.checklists[0].name).toBe("Tasks");
            expect(parsed.checklists[0].items).toHaveLength(1);
            expect(parsed.checklists[1].name).toBe("Shopping");
            expect(parsed.checklists[1].items).toHaveLength(1);
        });

        it("should return empty checklists array when none exist", async () => {
            const jsonStr = await manager.exportAllAsJson();
            const parsed = JSON.parse(jsonStr);
            expect(parsed.checklists).toEqual([]);
        });
    });

    describe("list kind (checklist without checks)", () => {
        it("should default kind to 'checklist'", async () => {
            const c = await manager.createChecklist("Tasks", []);
            expect(c.kind).toBe("checklist");
        });

        it("should create a list with kind 'list' when specified", async () => {
            const c = await manager.createChecklist("Books", [{ name: "Author", type: "text" }], "list");
            expect(c.kind).toBe("list");
        });

        it("should not write completed front matter for list items", async () => {
            const c = await manager.createChecklist("Books", [{ name: "Author", type: "text" }], "list");
            const createSpy = jest.spyOn(app.vault, "create");
            await manager.addItem(c.id, "Dune", { Author: "Herbert" }, "");
            const [, content] = createSpy.mock.calls[0];
            expect(content).toContain("Author: Herbert");
            expect(content).not.toContain("completed:");
        });

        it("should always report list items as not completed", async () => {
            const c = await manager.createChecklist("Books", [], "list");
            await manager.addItem(c.id, "Dune", {}, "");
            const items = await manager.getItems(c.id);
            expect(items[0].completed).toBe(false);
        });

        it("should export a list as bullets without checkboxes", async () => {
            const c = await manager.createChecklist("Books", [{ name: "Author", type: "text" }], "list");
            await manager.addItem(c.id, "Dune", { Author: "Herbert" }, "");
            const md = await manager.exportChecklistAsMarkdown(c.id);
            expect(md).toContain("# Books");
            expect(md).toContain("- Dune");
            expect(md).not.toContain("- [ ] Dune");
            expect(md).toContain("Author: Herbert");
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

    describe("syncChecklistsFromFolder", () => {
        it("should create default checklists from existing subfolders", async () => {
            await app.vault.createFolder("projects");
            await app.vault.createFolder("projects/Work");
            await app.vault.createFolder("projects/Home");

            await manager.syncChecklistsFromFolder("projects");

            const settings = manager.getSettings();
            expect(settings.checklists).toHaveLength(2);
            expect(settings.checklists.map((c) => c.folderPath).sort()).toEqual([
                "projects/Home",
                "projects/Work",
            ]);
            expect(settings.checklists.every((c) => c.kind === "checklist")).toBe(true);
            expect(settings.checklists.every((c) => c.properties.length === 0)).toBe(true);
            expect(saveFn).toHaveBeenCalled();
        });

        it("should clear active checklist when it no longer exists after folder sync", async () => {
            const existing = await manager.createChecklist("Legacy", []);
            manager.setActiveChecklist(existing.id);
            saveFn.mockClear();

            await app.vault.createFolder("projects");
            await app.vault.createFolder("projects/New");

            await manager.syncChecklistsFromFolder("projects");

            const settings = manager.getSettings();
            expect(settings.activeChecklistId).toBeNull();
            expect(settings.checklists).toHaveLength(1);
            expect(settings.checklists[0].folderPath).toBe("projects/New");
            expect(saveFn).toHaveBeenCalled();
        });
    });
});
