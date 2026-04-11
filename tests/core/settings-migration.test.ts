import { migrateSettings } from "src/main";

describe("migrateSettings", () => {
    it("returns defaults for null input", () => {
        const s = migrateSettings(null);
        expect(s.settingsVersion).toBe(1);
        expect(s.definitions).toEqual([]);
    });

    it("returns defaults for non-object input", () => {
        const s = migrateSettings("not-an-object");
        expect(s.settingsVersion).toBe(1);
        expect(s.definitions).toEqual([]);
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
        expect(s.settingsVersion).toBe(1);
    });

    it("ignores non-array definitions field", () => {
        const s = migrateSettings({ settingsVersion: 1, definitions: "oops" });
        expect(s.definitions).toEqual([]);
    });
});
