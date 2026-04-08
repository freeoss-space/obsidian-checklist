/**
 * @jest-environment jsdom
 *
 * The checklist sidebar should NOT auto-open on plugin load.
 * It should only open when the user explicitly requests it (ribbon icon,
 * command palette, etc.).  Obsidian restores previously-open views
 * automatically via workspace serialization, so forcing the sidebar open
 * in onLayoutReady is unnecessary and disruptive.
 */
import ChecklistPlugin from "../../src/main";
import { App } from "obsidian";

describe("sidebar should not auto-open on plugin load", () => {
    it("does not call activateSidebar from an onLayoutReady callback", async () => {
        const app = new App();
        const plugin = new ChecklistPlugin(app, {} as any);

        // Capture any callback registered via onLayoutReady
        let layoutReadyCb: (() => void) | null = null;
        jest.spyOn(app.workspace, "onLayoutReady").mockImplementation((cb: () => void) => {
            layoutReadyCb = cb;
        });

        const activateSpy = jest
            .spyOn(ChecklistPlugin.prototype, "activateSidebar")
            .mockResolvedValue(undefined);

        await plugin.onload();

        // Reset count so the ribbon-icon registration path doesn't pollute
        activateSpy.mockClear();

        // If a layoutReady callback was registered, invoke it and verify
        // it does NOT call activateSidebar.
        if (layoutReadyCb) {
            layoutReadyCb();
        }

        expect(activateSpy).not.toHaveBeenCalled();
    });
});
