import { App } from "obsidian";
import ChecklistPlugin from "src/main";
import { ChecklistSettingTab } from "src/ui/settings-tab";

const MANIFEST = {
    id: "obsidian-checklist",
    name: "Checklist",
    version: "0.0.0",
    minAppVersion: "0.12.0",
    description: "Checklist plugin",
    author: "Test",
};

function makePlugin(): ChecklistPlugin {
    const app = new App();
    return new ChecklistPlugin(app, MANIFEST);
}

describe("ChecklistSettingTab", () => {
    it("renders a folder input field pre-populated with the current setting", async () => {
        const plugin = makePlugin();
        await plugin.onload();
        plugin.settings.defaultFolder = "MyFolder";
        const tab = new ChecklistSettingTab(plugin.app, plugin);
        tab.display();
        const input = tab.containerEl.querySelector(
            "input.checklist-default-folder"
        ) as HTMLInputElement;
        expect(input).not.toBeNull();
        expect(input.value).toBe("MyFolder");
    });

    it("renders an explicit Save button", async () => {
        const plugin = makePlugin();
        await plugin.onload();
        const tab = new ChecklistSettingTab(plugin.app, plugin);
        tab.display();
        const save = tab.containerEl.querySelector(
            "button.checklist-settings-save"
        ) as HTMLButtonElement;
        expect(save).not.toBeNull();
        expect((save.textContent || "").toLowerCase()).toContain("save");
    });

    it("persists the folder value only when Save is clicked", async () => {
        const plugin = makePlugin();
        await plugin.onload();
        let savedData: unknown = null;
        // Hook saveData to observe persistence
        plugin.saveData = async (data: unknown) => {
            savedData = data;
        };
        const tab = new ChecklistSettingTab(plugin.app, plugin);
        tab.display();
        const input = tab.containerEl.querySelector(
            "input.checklist-default-folder"
        ) as HTMLInputElement;
        input.value = "New/Folder";
        input.dispatchEvent(new Event("input"));
        // Not yet saved: still the previous value on disk
        expect(savedData).toBeNull();
        const save = tab.containerEl.querySelector(
            "button.checklist-settings-save"
        ) as HTMLButtonElement;
        save.click();
        await new Promise((r) => setTimeout(r, 0));
        expect(plugin.settings.defaultFolder).toBe("New/Folder");
        expect(savedData).not.toBeNull();
        expect((savedData as { defaultFolder?: string }).defaultFolder).toBe("New/Folder");
    });

    it("refuses to save a folder with traversal segments", async () => {
        const plugin = makePlugin();
        await plugin.onload();
        let savedData: unknown = null;
        plugin.saveData = async (data: unknown) => {
            savedData = data;
        };
        const tab = new ChecklistSettingTab(plugin.app, plugin);
        tab.display();
        const input = tab.containerEl.querySelector(
            "input.checklist-default-folder"
        ) as HTMLInputElement;
        input.value = "../../etc";
        input.dispatchEvent(new Event("input"));
        const save = tab.containerEl.querySelector(
            "button.checklist-settings-save"
        ) as HTMLButtonElement;
        save.click();
        await new Promise((r) => setTimeout(r, 0));
        // Hard gate: setting is not updated, and nothing is persisted.
        expect(plugin.settings.defaultFolder).not.toBe("../../etc");
        expect(savedData).toBeNull();
        // Error message surfaced to the user
        const err = tab.containerEl.querySelector(".checklist-settings-error");
        expect(err).not.toBeNull();
    });

    it("never renders error messages as HTML (XSS hard-gate)", async () => {
        const plugin = makePlugin();
        await plugin.onload();
        const tab = new ChecklistSettingTab(plugin.app, plugin);
        tab.display();
        const input = tab.containerEl.querySelector(
            "input.checklist-default-folder"
        ) as HTMLInputElement;
        input.value = "<img src=x onerror=alert(1)>";
        input.dispatchEvent(new Event("input"));
        const save = tab.containerEl.querySelector(
            "button.checklist-settings-save"
        ) as HTMLButtonElement;
        save.click();
        await new Promise((r) => setTimeout(r, 0));
        const err = tab.containerEl.querySelector(".checklist-settings-error");
        // either it saved (no error) or the error is text-only
        if (err) {
            expect(err.querySelector("img")).toBeNull();
        }
    });
});
