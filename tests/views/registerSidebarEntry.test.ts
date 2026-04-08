/**
 * @jest-environment jsdom
 */
import { App, WorkspaceLeaf } from "obsidian";
import ChecklistPlugin from "../../src/main";
import { VIEW_TYPE_CHECKLIST_SIDEBAR } from "../../src/constants";

describe("sidebar entry registration on plugin load", () => {
    it("registers a left sidebar leaf entry but does not auto-select it", async () => {
        const app = new App();
        const plugin = new ChecklistPlugin(app, {} as any);
        const mockLeaf = new WorkspaceLeaf();

        jest.spyOn(app.workspace, "getLeavesOfType").mockReturnValue([]);
        jest.spyOn(app.workspace, "getLeftLeaf").mockReturnValue(mockLeaf);
        const setViewStateSpy = jest.spyOn(mockLeaf, "setViewState");
        const revealLeafSpy = jest.spyOn(app.workspace, "revealLeaf");

        await plugin.onload();

        expect(setViewStateSpy).toHaveBeenCalledWith({
            type: VIEW_TYPE_CHECKLIST_SIDEBAR,
            active: false,
        });
        expect(revealLeafSpy).not.toHaveBeenCalled();
    });
});
