/**
 * @jest-environment jsdom
 *
 * Integration tests for openAddItemModal in ChecklistPlugin.
 * Verifies that confirming the modal actually creates an item in the vault.
 */
import ChecklistPlugin from "../../src/main";
import { AddItemModal } from "../../src/modals/AddItemModal";
import { App } from "obsidian";

describe("openAddItemModal integration", () => {
    let app: App;
    let plugin: ChecklistPlugin;

    beforeEach(async () => {
        app = new App();
        plugin = new ChecklistPlugin(app, {} as any);
        await plugin.onload();
    });

    it("does nothing when no active checklist exists", () => {
        // No checklist created → no active checklist
        const noticeSpy = jest.fn();
        // Notice is mocked globally, just ensure openAddItemModal doesn't throw
        expect(() => plugin.openAddItemModal()).not.toThrow();
    });

    it("creates an item in the vault when the modal onSubmit callback is invoked", async () => {
        const checklist = await plugin.manager.createChecklist("Tasks", []);

        // Intercept AddItemModal.open() to capture the onSubmit callback
        let capturedOnSubmit: ((name: string, props: Record<string, any>, desc: string) => void) | null = null;
        const openSpy = jest.spyOn(AddItemModal.prototype, "open").mockImplementation(function () {
            capturedOnSubmit = (this as any).onSubmit;
        });

        plugin.openAddItemModal();

        expect(capturedOnSubmit).not.toBeNull();

        // Simulate the user filling in the form and clicking confirm
        await capturedOnSubmit!("Buy milk", {}, "From the store");

        const items = await plugin.manager.getItems(checklist.id);
        expect(items).toHaveLength(1);
        expect(items[0].name).toBe("Buy milk");
        expect(items[0].description).toBe("From the store");

        openSpy.mockRestore();
    });

    it("passes the active checklist id (not a stale one) to addItem", async () => {
        const c1 = await plugin.manager.createChecklist("First", []);
        const c2 = await plugin.manager.createChecklist("Second", []);
        plugin.manager.setActiveChecklist(c1.id);

        let capturedOnSubmit: Function | null = null;
        const openSpy = jest.spyOn(AddItemModal.prototype, "open").mockImplementation(function () {
            capturedOnSubmit = (this as any).onSubmit;
        });

        plugin.openAddItemModal();

        // Switch active checklist while modal is "open" — item should still go to c1
        plugin.manager.setActiveChecklist(c2.id);

        await capturedOnSubmit!("Task for first", {}, "");

        const items1 = await plugin.manager.getItems(c1.id);
        const items2 = await plugin.manager.getItems(c2.id);
        expect(items1).toHaveLength(1);
        expect(items2).toHaveLength(0);

        openSpy.mockRestore();
    });

    it("uses the active checklist's properties when opening the modal", async () => {
        const properties = [{ name: "Priority", type: "text" as const, defaultValue: "Medium" }];
        const checklist = await plugin.manager.createChecklist("Tasks", properties);

        let capturedProperties: any = null;
        const openSpy = jest.spyOn(AddItemModal.prototype, "open").mockImplementation(function () {
            capturedProperties = (this as any).properties;
        });

        plugin.openAddItemModal();

        expect(capturedProperties).toEqual(properties);

        openSpy.mockRestore();
    });
});
