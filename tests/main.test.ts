import { App } from "obsidian";
import ChecklistPlugin from "src/main";
import { VIEW_TYPE_CHECKLIST } from "src/constants";

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

describe("ChecklistPlugin.onload", () => {
    it("registers the checklist view", async () => {
        const plugin = makePlugin();
        await plugin.onload();
        // @ts-expect-error test-only field exposed by the mocked Plugin
        expect(plugin.registeredViews[VIEW_TYPE_CHECKLIST]).toBeDefined();
    });

    it("exposes a Checklists ribbon entry in the sidebar", async () => {
        const plugin = makePlugin();
        await plugin.onload();
        // @ts-expect-error test-only field exposed by the mocked Plugin
        const ribbons = plugin.ribbons as Array<{ icon: string; title: string; el: HTMLElement }>;
        expect(ribbons.length).toBeGreaterThan(0);
        const entry = ribbons.find(
            (r) => /checklist/i.test(r.title) && r.icon === "check-square"
        );
        expect(entry).toBeDefined();
        // The entry must be a reachable HTMLElement with an aria-label the user can discover.
        expect(entry!.el.getAttribute("aria-label") || "").toMatch(/checklist/i);
    });

    it("registers command palette entries to open the sidebar and create a checklist", async () => {
        const plugin = makePlugin();
        await plugin.onload();
        // @ts-expect-error test-only field exposed by the mocked Plugin
        const commands = plugin.commands as Array<{ id: string; name: string }>;
        expect(commands.some((c) => c.id === "checklist-open")).toBe(true);
        expect(commands.some((c) => c.id === "checklist-new-list")).toBe(true);
    });

    it("registers a Checklist settings tab", async () => {
        const plugin = makePlugin();
        await plugin.onload();
        // @ts-expect-error test-only field exposed by the mocked Plugin
        expect(plugin.settingTabs.length).toBeGreaterThan(0);
    });

    it("loads settings with defaultFolder field present", async () => {
        const plugin = makePlugin();
        await plugin.onload();
        // Hard gate: the defaultFolder setting must exist after loading
        // — even on a fresh (null) data file.
        expect(typeof plugin.settings.defaultFolder).toBe("string");
    });

    it("rejects unsafe default folder characters at save time", async () => {
        const plugin = makePlugin();
        await plugin.onload();
        // Nullbyte and traversal must be blocked.
        await expect(plugin.setDefaultFolder("../../evil")).rejects.toThrow();
        await expect(plugin.setDefaultFolder("a\u0000b")).rejects.toThrow();
    });

    it("accepts a normal folder path and persists it", async () => {
        const plugin = makePlugin();
        await plugin.onload();
        await plugin.setDefaultFolder("Checklists");
        expect(plugin.settings.defaultFolder).toBe("Checklists");
    });

    it("strips trailing slashes from the default folder", async () => {
        const plugin = makePlugin();
        await plugin.onload();
        await plugin.setDefaultFolder("Stuff/Lists/");
        expect(plugin.settings.defaultFolder).toBe("Stuff/Lists");
    });
});
