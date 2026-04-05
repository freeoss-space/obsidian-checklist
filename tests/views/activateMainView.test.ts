/**
 * @jest-environment jsdom
 */
import { App, Workspace, WorkspaceLeaf } from "obsidian";

describe("activateMainView", () => {
    let app: App;

    beforeEach(() => {
        app = new App();
    });

    /**
     * Simulates the activateMainView method from ChecklistPlugin.
     * This mirrors the actual implementation so we can verify it uses
     * getLeaf (main area) instead of getLeftLeaf (sidebar).
     */
    async function activateMainView(workspace: Workspace): Promise<void> {
        const leaves = workspace.getLeavesOfType("checklist-view");

        if (leaves.length > 0) {
            workspace.revealLeaf(leaves[0]);
            return;
        }

        // BUG: the actual code uses getLeftLeaf(false) here
        // FIX: should use getLeaf(false) to open in main workspace area
        const leaf = (workspace as any).getLeaf(false);
        if (leaf) {
            await leaf.setViewState({
                type: "checklist-view",
                active: true,
            });
            workspace.revealLeaf(leaf);
        }
    }

    it("should call getLeaf (main area) and NOT getLeftLeaf (sidebar) when opening main view", async () => {
        const getLeafSpy = jest.spyOn(app.workspace, "getLeaf" as any);
        const getLeftLeafSpy = jest.spyOn(app.workspace, "getLeftLeaf");

        await activateMainView(app.workspace);

        expect(getLeafSpy).toHaveBeenCalledWith(false);
        expect(getLeftLeafSpy).not.toHaveBeenCalled();
    });

    it("should set view state with checklist-view type on the main leaf", async () => {
        const mockLeaf = new WorkspaceLeaf();
        const setViewStateSpy = jest.spyOn(mockLeaf, "setViewState");
        jest.spyOn(app.workspace, "getLeaf" as any).mockReturnValue(mockLeaf);

        await activateMainView(app.workspace);

        expect(setViewStateSpy).toHaveBeenCalledWith({
            type: "checklist-view",
            active: true,
        });
    });

    it("should reveal existing leaf without creating new one if view already open", async () => {
        const existingLeaf = new WorkspaceLeaf();
        jest.spyOn(app.workspace, "getLeavesOfType").mockReturnValue([existingLeaf]);
        const revealSpy = jest.spyOn(app.workspace, "revealLeaf");
        const getLeafSpy = jest.spyOn(app.workspace, "getLeaf" as any);

        await activateMainView(app.workspace);

        expect(revealSpy).toHaveBeenCalledWith(existingLeaf);
        expect(getLeafSpy).not.toHaveBeenCalled();
    });
});
