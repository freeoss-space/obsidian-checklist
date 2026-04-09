/**
 * @jest-environment jsdom
 */
import { App, WorkspaceLeaf } from "obsidian";
import { ChecklistSidebarView } from "../../src/views/ChecklistSidebarView";
import { ChecklistManager } from "../../src/services/ChecklistManager";
import { DEFAULT_SETTINGS } from "../../src/models/types";

/**
 * Recursively adds Obsidian's HTMLElement extension methods to a DOM element
 * so that view code using createDiv / createEl / createSpan / empty / addClass
 * works correctly under jsdom.
 */
function addObsidianExtensions(el: HTMLElement): void {
    (el as any).empty = function () { this.innerHTML = ""; };

    (el as any).addClass = function (...cls: string[]) {
        cls.forEach((c) => this.classList.add(c));
    };

    (el as any).setText = function (text: string) {
        this.textContent = text;
    };

    (el as any).createDiv = function (opts?: { cls?: string }) {
        const div = document.createElement("div");
        if (opts?.cls) div.className = opts.cls;
        addObsidianExtensions(div);
        this.appendChild(div);
        return div;
    };

    (el as any).createEl = function (
        tag: string,
        opts?: {
            text?: string;
            cls?: string;
            type?: string;
            attr?: Record<string, string>;
        }
    ) {
        const child = document.createElement(tag);
        if (opts?.text) child.textContent = opts.text;
        if (opts?.cls) child.className = opts.cls;
        if (opts?.type) (child as HTMLInputElement).type = opts.type;
        if (opts?.attr) {
            Object.entries(opts.attr).forEach(([k, v]) => child.setAttribute(k, v));
        }
        addObsidianExtensions(child);
        this.appendChild(child);
        return child;
    };

    (el as any).createSpan = function (opts?: { text?: string; cls?: string }) {
        const span = document.createElement("span");
        if (opts?.text) span.textContent = opts.text;
        if (opts?.cls) span.className = opts.cls;
        addObsidianExtensions(span);
        this.appendChild(span);
        return span;
    };
}

describe("ChecklistSidebarView header buttons", () => {
    let manager: ChecklistManager;
    let leaf: WorkspaceLeaf;

    beforeEach(() => {
        const app = new App();
        manager = new ChecklistManager(app, { ...DEFAULT_SETTINGS }, jest.fn());
        leaf = new WorkspaceLeaf();
    });

    function makeView(onCreateList = jest.fn()): ChecklistSidebarView {
        const view = new ChecklistSidebarView(
            leaf,
            manager,
            jest.fn(),
            onCreateList,
            jest.fn(),
            jest.fn()
        );

        // Obsidian views have two children on containerEl: a header [0] and
        // a content area [1].  Replicate that structure with Obsidian DOM
        // extensions so onOpen() can run without errors.
        view.containerEl.innerHTML = "";
        const header = document.createElement("div");
        const content = document.createElement("div");
        addObsidianExtensions(content);
        view.containerEl.appendChild(header);
        view.containerEl.appendChild(content);

        return view;
    }

    it("adds a 'New checklist' action button in the view header on open", async () => {
        const view = makeView();
        // jest.spyOn requires the method to already exist on the prototype.
        // Adding addAction to ItemView mock makes this the RED→GREEN pivot.
        const addActionSpy = jest.spyOn(view as any, "addAction");

        await view.onOpen();

        expect(addActionSpy).toHaveBeenCalledWith(
            "plus",
            "New checklist",
            expect.any(Function)
        );
    });

    it("calls onCreateList when the 'New checklist' action is triggered", async () => {
        const onCreateList = jest.fn();
        const view = makeView(onCreateList);

        let newChecklistCallback: (() => void) | undefined;
        jest.spyOn(view as any, "addAction").mockImplementation(
            (_icon: string, label: string, cb: () => void) => {
                if (label === "New checklist") newChecklistCallback = cb;
            }
        );

        await view.onOpen();

        expect(newChecklistCallback).toBeDefined();
        newChecklistCallback!();
        expect(onCreateList).toHaveBeenCalledTimes(1);
    });

    it("adds an 'Export all checklists' action button in the view header on open", async () => {
        const view = makeView();
        const addActionSpy = jest.spyOn(view as any, "addAction");

        await view.onOpen();

        expect(addActionSpy).toHaveBeenCalledWith(
            "download",
            "Export all checklists",
            expect.any(Function)
        );
    });

    it("renders an always-visible 'New checklist' button in the content area nav-header", async () => {
        const view = makeView();
        await view.onOpen();

        const content = view.containerEl.children[1] as HTMLElement;
        const navHeader = content.querySelector(".nav-header");
        expect(navHeader).not.toBeNull();

        const navBtn = content.querySelector(".nav-buttons-container .nav-action-button");
        expect(navBtn).not.toBeNull();
        expect((navBtn as HTMLElement).getAttribute("aria-label")).toBe("New checklist");
    });

    it("calls onCreateList when the content-area 'New checklist' button is clicked", async () => {
        const onCreateList = jest.fn();
        const view = makeView(onCreateList);
        await view.onOpen();

        const content = view.containerEl.children[1] as HTMLElement;
        const navBtn = content.querySelector(
            ".nav-buttons-container .nav-action-button"
        ) as HTMLElement | null;
        expect(navBtn).not.toBeNull();
        navBtn!.click();

        expect(onCreateList).toHaveBeenCalledTimes(1);
    });
});
