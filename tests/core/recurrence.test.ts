import { nextOccurrence } from "src/core/recurrence";

describe("nextOccurrence", () => {
    it("rolls a daily recurrence forward one day", () => {
        expect(nextOccurrence("2025-03-14", "1d")).toBe("2025-03-15");
    });

    it("rolls a weekly recurrence forward 7 days", () => {
        expect(nextOccurrence("2025-03-14", "1w")).toBe("2025-03-21");
    });

    it("rolls a monthly recurrence forward one month", () => {
        expect(nextOccurrence("2025-01-31", "1m")).toBe("2025-02-28");
    });

    it("returns null for unknown pattern", () => {
        expect(nextOccurrence("2025-03-14", "potato")).toBeNull();
    });

    it("returns null for invalid date", () => {
        expect(nextOccurrence("not-a-date", "1d")).toBeNull();
    });
});
