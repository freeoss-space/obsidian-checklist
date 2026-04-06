/**
 * @jest-environment jsdom
 *
 * Regression test: the checklist sidebar menu entry should appear automatically
 * when the plugin loads, so users see the panel in the left sidebar without
 * having to run a command first.
 */
import ChecklistPlugin from "../../src/main";
import { App } from "obsidian";
import { VIEW_TYPE_CHECKLIST_SIDEBAR } from "../../src/constants";

describe("sidebar menu entry on plugin load", () => {
    it("registers an onLayoutReady callback that activates the sidebar view", async () => {
        const app = new App();
        const plugin = new ChecklistPlugin(app, {} as any);

        let layoutReadyCb: (() => void) | null = null;
        jest.spyOn(app.workspace, "onLayoutReady").mockImplementation((cb: () => void) => {
            layoutReadyCb = cb;
        });

        const activateSpy = jest
            .spyOn(ChecklistPlugin.prototype, "activateSidebar")
            .mockResolvedValue(undefined);

        await plugin.onload();

        expect(layoutReadyCb).not.toBeNull();
        // Reset count so the ribbon-icon path doesn't pollute the assertion.
        activateSpy.mockClear();
        layoutReadyCb!();
        expect(activateSpy).toHaveBeenCalled();
        expect(VIEW_TYPE_CHECKLIST_SIDEBAR).toBeDefined();
    });
});
