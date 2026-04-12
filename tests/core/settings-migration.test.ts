import { migrateSettings } from "src/main";

const CURRENT_VERSION = 2;

describe("migrateSettings", () => {
    it("returns defaults for null input", () => {
        const s = migrateSettings(null);
        expect(s.settingsVersion).toBe(CURRENT_VERSION);
        expect(s.definitions).toEqual([]);
        expect(s.defaultFolder).toBe("");
    });

    it("returns defaults for non-object input", () => {
        const s = migrateSettings("not-an-object");
        expect(s.settingsVersion).toBe(CURRENT_VERSION);
        expect(s.definitions).toEqual([]);
        expect(s.defaultFolder).toBe("");
    });

    it("preserves existing definitions", () => {
        const raw = {
            settingsVersion: 1,
            definitions: [{ id: "a", name: "A", kind: "checklist", folder: "A", properties: [] }],
        };
        const s = migrateSettings(raw);
        expect(s.definitions).toHaveLength(1);
        expect(s.definitions[0].id).toBe("a");
    });

    it("bumps version from 0 to current and keeps definitions", () => {
        const raw = { definitions: [], settingsVersion: 0 };
        const s = migrateSettings(raw);
        expect(s.settingsVersion).toBe(CURRENT_VERSION);
    });

    it("ignores non-array definitions field", () => {
        const s = migrateSettings({ settingsVersion: 1, definitions: "oops" });
        expect(s.definitions).toEqual([]);
    });

    it("carries a valid defaultFolder through migration", () => {
        const s = migrateSettings({ settingsVersion: 1, definitions: [], defaultFolder: "Lists" });
        expect(s.defaultFolder).toBe("Lists");
    });

    it("strips trailing slashes from a persisted defaultFolder", () => {
        const s = migrateSettings({ settingsVersion: 2, definitions: [], defaultFolder: "Lists/" });
        expect(s.defaultFolder).toBe("Lists");
    });

    it("drops an unsafe defaultFolder rather than honoring it", () => {
        const s = migrateSettings({
            settingsVersion: 2,
            definitions: [],
            defaultFolder: "../../etc",
        });
        expect(s.defaultFolder).toBe("");
    });
});
