/**
 * @jest-environment jsdom
 */
import { App } from "obsidian";
import ChecklistPlugin from "../../src/main";

describe("plugin onunload", () => {
    it("does not wipe persisted settings on unload", async () => {
        const app = new App();
        const plugin = new ChecklistPlugin(app, {} as any);
        await plugin.onload();

        const saveDataSpy = jest.spyOn(plugin, "saveData");

        plugin.onunload();

        // saveData must not be called with an empty object (which would wipe all settings)
        expect(saveDataSpy).not.toHaveBeenCalledWith({});
    });
});
