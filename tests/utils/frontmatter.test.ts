import { generateFrontmatter, parseFrontmatter } from "src/utils/frontmatter";
import { PropertyDefinition } from "src/models/types";

describe("frontmatter utilities", () => {
    describe("generateFrontmatter", () => {
        it("should generate YAML front matter from properties", () => {
            const properties: Record<string, string | number | boolean> = {
                Priority: "High",
                "Due Date": "2026-04-05",
                Count: 3,
            };
            const result = generateFrontmatter(properties);
            expect(result).toContain("---");
            expect(result).toContain("Priority: High");
            expect(result).toContain("Due Date: \"2026-04-05\"");
            expect(result).toContain("Count: 3");
            // Should start and end with ---
            const lines = result.trim().split("\n");
            expect(lines[0]).toBe("---");
            expect(lines[lines.length - 1]).toBe("---");
        });

        it("should include completed field set to false by default", () => {
            const result = generateFrontmatter({ Name: "Test" });
            expect(result).toContain("completed: false");
        });

        it("should handle empty properties", () => {
            const result = generateFrontmatter({});
            expect(result).toContain("---");
            expect(result).toContain("completed: false");
        });

        it("should escape special characters in string values", () => {
            const result = generateFrontmatter({ Note: "has: colon" });
            expect(result).toContain('Note: "has: colon"');
        });

        it("should handle boolean values", () => {
            const result = generateFrontmatter({ Done: true });
            expect(result).toContain("Done: true");
        });
    });

    describe("parseFrontmatter", () => {
        it("should parse YAML front matter from markdown content", () => {
            const content = `---
Priority: High
Due Date: "2026-04-05"
completed: false
---

Some description here.`;
            const result = parseFrontmatter(content);
            expect(result.properties["Priority"]).toBe("High");
            expect(result.properties["Due Date"]).toBe("2026-04-05");
            expect(result.properties["completed"]).toBe("false");
            expect(result.body).toBe("Some description here.");
        });

        it("should return empty properties for content without front matter", () => {
            const content = "Just a plain note.";
            const result = parseFrontmatter(content);
            expect(result.properties).toEqual({});
            expect(result.body).toBe("Just a plain note.");
        });

        it("should handle front matter with no body", () => {
            const content = `---
Name: Test
completed: false
---`;
            const result = parseFrontmatter(content);
            expect(result.properties["Name"]).toBe("Test");
            expect(result.body).toBe("");
        });

        it("should handle numeric values", () => {
            const content = `---
Count: 42
completed: false
---`;
            const result = parseFrontmatter(content);
            expect(result.properties["Count"]).toBe("42");
        });

        it("should handle multiline body", () => {
            const content = `---
Name: Test
---

Line 1
Line 2
Line 3`;
            const result = parseFrontmatter(content);
            expect(result.body).toBe("Line 1\nLine 2\nLine 3");
        });
    });
});
