/**
 * @jest-environment jsdom
 *
 * The checklist plugin should register share-intent handlers so that when
 * Obsidian mobile receives shared text **or a URL**, the user sees an
 * "Add to Checklist" menu item.
 *
 * Obsidian fires `receive-text-menu` for plain text shares and
 * `receive-url-menu` for URL shares.  Both must be handled.
 */
import { App, Menu } from "obsidian";
import ChecklistPlugin from "../../src/main";

/**
 * Helper – capture every event handler registered through
 * `this.registerEvent(this.app.workspace.on(name, handler))`.
 *
 * Returns a map from event name → handler so we can invoke the handler
 * in the test and inspect its side-effects.
 */
function setupMobilePlugin(): {
    plugin: ChecklistPlugin;
    handlers: Map<string, (...args: any[]) => void>;
} {
    const app = new App() as any;
    app.isMobile = true; // simulate mobile environment

    // Track events registered via workspace.on()
    const handlers = new Map<string, (...args: any[]) => void>();
    app.workspace.on = jest.fn((name: string, handler: (...args: any[]) => void) => {
        handlers.set(name, handler);
        return { name, handler }; // event ref
    });

    const plugin = new ChecklistPlugin(app, {} as any);
    return { plugin, handlers };
}

describe("share intent registration", () => {
    it("registers a receive-text-menu handler on mobile", async () => {
        const { plugin, handlers } = setupMobilePlugin();
        await plugin.onload();
        expect(handlers.has("receive-text-menu")).toBe(true);
    });

    it("registers a receive-url-menu handler on mobile", async () => {
        const { plugin, handlers } = setupMobilePlugin();
        await plugin.onload();
        expect(handlers.has("receive-url-menu")).toBe(true);
    });

    it("receive-text-menu handler adds 'Add to Checklist' menu item", async () => {
        const { plugin, handlers } = setupMobilePlugin();
        await plugin.onload();

        const handler = handlers.get("receive-text-menu")!;
        expect(handler).toBeDefined();

        const menu = new Menu();
        const addItemSpy = jest.spyOn(menu, "addItem");

        handler(menu, "Shared note text");

        expect(addItemSpy).toHaveBeenCalled();
    });

    it("receive-url-menu handler adds 'Add to Checklist' menu item", async () => {
        const { plugin, handlers } = setupMobilePlugin();
        await plugin.onload();

        const handler = handlers.get("receive-url-menu")!;
        expect(handler).toBeDefined();

        const menu = new Menu();
        const addItemSpy = jest.spyOn(menu, "addItem");

        handler(menu, "https://example.com");

        expect(addItemSpy).toHaveBeenCalled();
    });
});
