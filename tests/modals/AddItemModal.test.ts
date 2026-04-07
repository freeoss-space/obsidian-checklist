/**
 * @jest-environment jsdom
 *
 * Tests for AddItemModal: verifies that the confirm button wires up correctly
 * and that onSubmit is called with the right arguments when the user confirms.
 */
import { AddItemModal } from "../../src/modals/AddItemModal";
import { App } from "obsidian";

describe("AddItemModal", () => {
    let app: App;

    beforeEach(() => {
        app = new App();
    });

    it("calls onSubmit with trimmed name and empty properties when confirmed", () => {
        const onSubmit = jest.fn();
        const modal = new AddItemModal(app, [], onSubmit);
        modal.onOpen();

        // Simulate user typing a name into the Name field
        (modal as any).itemName = "Buy groceries";

        // Click the "Add Item" confirm button
        const btn = modal.contentEl.querySelector("button");
        expect(btn).not.toBeNull();
        btn!.click();

        expect(onSubmit).toHaveBeenCalledTimes(1);
        expect(onSubmit).toHaveBeenCalledWith("Buy groceries", {}, "");
    });

    it("does not call onSubmit when name is empty", () => {
        const onSubmit = jest.fn();
        const modal = new AddItemModal(app, [], onSubmit);
        modal.onOpen();

        // Leave itemName as "" (default)
        const btn = modal.contentEl.querySelector("button");
        expect(btn).not.toBeNull();
        btn!.click();

        expect(onSubmit).not.toHaveBeenCalled();
    });

    it("calls onSubmit with property values when properties are set", () => {
        const onSubmit = jest.fn();
        const properties = [{ name: "Priority", type: "text" as const }];
        const modal = new AddItemModal(app, properties, onSubmit);
        modal.onOpen();

        (modal as any).itemName = "Task";
        (modal as any).propertyValues = { Priority: "High" };

        const btn = modal.contentEl.querySelector("button");
        btn!.click();

        expect(onSubmit).toHaveBeenCalledWith("Task", { Priority: "High" }, "");
    });

    it("calls onSubmit with trimmed description", () => {
        const onSubmit = jest.fn();
        const modal = new AddItemModal(app, [], onSubmit);
        modal.onOpen();

        (modal as any).itemName = "Task";
        (modal as any).description = "  some description  ";

        const btn = modal.contentEl.querySelector("button");
        btn!.click();

        expect(onSubmit).toHaveBeenCalledWith("Task", {}, "some description");
    });

    it("closes the modal only after onSubmit resolves, not synchronously before it completes", async () => {
        // This test captures the bug: the onClick handler was synchronous, so
        // this.close() was called immediately after onSubmit(), even before the
        // async operation completed. If onSubmit() failed, the error was silently
        // dropped and the item was never created — but the modal still closed.
        let resolveSubmit!: () => void;
        const submitPromise = new Promise<void>((resolve) => {
            resolveSubmit = resolve;
        });
        const onSubmit = jest.fn().mockReturnValue(submitPromise);

        const modal = new AddItemModal(app, [], onSubmit);
        const closeSpy = jest.spyOn(modal, "close").mockImplementation(() => {});
        modal.onOpen();

        (modal as any).itemName = "Task";
        const btn = modal.contentEl.querySelector("button");
        btn!.click();

        // close() must NOT be called until onSubmit's promise resolves
        expect(closeSpy).not.toHaveBeenCalled();

        // Resolve onSubmit and allow microtasks to flush
        resolveSubmit();
        await submitPromise;
        await Promise.resolve(); // flush microtasks

        expect(closeSpy).toHaveBeenCalledTimes(1);
    });
});
