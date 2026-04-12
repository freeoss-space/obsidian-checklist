/**
 * Share intent registration — the plugin must, on mobile, register
 * `receive-text-menu` and `receive-url-menu` handlers that contribute an
 * "Add to Checklist" entry to the share sheet menu. Desktop (non-mobile)
 * must not register these handlers at all.
 */
import { App, Menu } from "obsidian";
import ChecklistPlugin from "src/main";

const MANIFEST = {
    id: "obsidian-checklist",
    name: "Checklist",
    version: "0.0.0",
    minAppVersion: "0.12.0",
    description: "Checklist plugin",
    author: "Test",
};

type Handler = (menu: Menu, payload: string) => void;

function setupPlugin(isMobile: boolean): {
    plugin: ChecklistPlugin;
    handlers: Map<string, Handler>;
} {
    const app = new App();
    // Simulate platform via a cast — real Obsidian exposes this at runtime.
    (app as unknown as { isMobile: boolean }).isMobile = isMobile;
    const handlers = new Map<string, Handler>();
    // Intercept workspace.on() for the events we care about.
    const ws = app.workspace as unknown as {
        on: (name: string, cb: Handler) => { name: string; cb: Handler };
    };
    ws.on = (name: string, cb: Handler) => {
        if (name === "receive-text-menu" || name === "receive-url-menu") {
            handlers.set(name, cb);
        }
        return { name, cb };
    };
    const plugin = new ChecklistPlugin(app, MANIFEST);
    return { plugin, handlers };
}

const setupMobilePlugin = () => setupPlugin(true);
const setupDesktopPlugin = () => setupPlugin(false);

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

    it("receive-text-menu handler contributes an 'Add to Checklist' menu item", async () => {
        const { plugin, handlers } = setupMobilePlugin();
        await plugin.onload();
        const handler = handlers.get("receive-text-menu")!;
        expect(handler).toBeDefined();
        const menu = new Menu();
        handler(menu, "Some shared text");
        // @ts-expect-error test-only items field
        const items = menu.items as Array<{ title: string; icon: string | null }>;
        expect(items.length).toBeGreaterThan(0);
        const entry = items.find((i) => /add to checklist/i.test(i.title));
        expect(entry).toBeDefined();
        expect(entry!.icon).toBe("check-square");
    });

    it("receive-url-menu handler contributes an 'Add to Checklist' menu item", async () => {
        const { plugin, handlers } = setupMobilePlugin();
        await plugin.onload();
        const handler = handlers.get("receive-url-menu")!;
        expect(handler).toBeDefined();
        const menu = new Menu();
        handler(menu, "https://example.com");
        // @ts-expect-error test-only items field
        const items = menu.items as Array<{ title: string; icon: string | null }>;
        const entry = items.find((i) => /add to checklist/i.test(i.title));
        expect(entry).toBeDefined();
    });

    it("does NOT register the share handlers on desktop", async () => {
        const { plugin, handlers } = setupDesktopPlugin();
        await plugin.onload();
        expect(handlers.has("receive-text-menu")).toBe(false);
        expect(handlers.has("receive-url-menu")).toBe(false);
    });

    it("menu click opens a share modal on the plugin", async () => {
        const { plugin, handlers } = setupMobilePlugin();
        await plugin.onload();
        let openedWith: string | null = null;
        // Swap the plugin's openShareModal hook so the test observes it
        // without actually mounting a modal.
        plugin.openShareModal = (text: string) => {
            openedWith = text;
        };
        const handler = handlers.get("receive-url-menu")!;
        const menu = new Menu();
        handler(menu, "https://example.com/foo");
        // @ts-expect-error test-only items
        const entry = menu.items[0];
        entry.click();
        expect(openedWith).toBe("https://example.com/foo");
    });
});
