import { parseFrontmatter, serializeFrontmatter, updateFrontmatter } from "src/core/frontmatter";

describe("parseFrontmatter", () => {
    it("returns empty object and full body when no front matter present", () => {
        const { data, body } = parseFrontmatter("hello world");
        expect(data).toEqual({});
        expect(body).toBe("hello world");
    });

    it("parses simple scalar values", () => {
        const src = `---\nname: Inbox\ncount: 3\ndone: true\n---\nbody`;
        const { data, body } = parseFrontmatter(src);
        expect(data).toEqual({ name: "Inbox", count: 3, done: true });
        expect(body).toBe("body");
    });

    it("strips quotes around quoted strings", () => {
        const { data } = parseFrontmatter(`---\ntitle: "Hello: world"\ndesc: 'it''s fine'\n---\n`);
        expect(data.title).toBe("Hello: world");
        expect(data.desc).toBe("it's fine");
    });

    it("parses inline arrays and flow lists", () => {
        const { data } = parseFrontmatter(`---\ntags: [a, b, "c d"]\n---\n`);
        expect(data.tags).toEqual(["a", "b", "c d"]);
    });

    it("parses block-style lists", () => {
        const src = `---\ntags:\n  - alpha\n  - beta\n  - "gamma 1"\nname: x\n---\n`;
        const { data } = parseFrontmatter(src);
        expect(data.tags).toEqual(["alpha", "beta", "gamma 1"]);
        expect(data.name).toBe("x");
    });

    it("ignores comments after a #", () => {
        const { data } = parseFrontmatter(`---\nname: hi # a comment\n---\n`);
        expect(data.name).toBe("hi");
    });

    it("treats malformed front matter as empty without throwing", () => {
        const src = `---\nname\n---\nbody`;
        const { data, body } = parseFrontmatter(src);
        expect(data).toEqual({});
        expect(body).toBe("body");
    });

    it("parses null / empty values", () => {
        const { data } = parseFrontmatter(`---\nname: \nother: null\n---\n`);
        expect(data.name).toBeNull();
        expect(data.other).toBeNull();
    });
});

describe("serializeFrontmatter", () => {
    it("roundtrips simple scalars", () => {
        const src = serializeFrontmatter({ name: "a", n: 2, done: false });
        expect(src).toBe(`---\nname: a\nn: 2\ndone: false\n---\n`);
    });

    it("quotes strings that contain special characters", () => {
        const src = serializeFrontmatter({ title: "Hello: world" });
        expect(src).toContain(`title: "Hello: world"`);
    });

    it("writes arrays as inline flow lists", () => {
        const src = serializeFrontmatter({ tags: ["a", "b c"] });
        expect(src).toContain(`tags: [a, "b c"]`);
    });

    it("writes null values as empty", () => {
        const src = serializeFrontmatter({ name: null });
        expect(src).toContain(`name: `);
    });
});

describe("parseFrontmatter - security", () => {
    it("ignores __proto__ / constructor / prototype keys (prototype pollution)", () => {
        const src = `---\n__proto__: polluted\nconstructor: x\nprototype: y\nname: ok\n---\n`;
        const { data } = parseFrontmatter(src);
        expect(data.name).toBe("ok");
        // Must not leak onto Object.prototype.
        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
        expect(Object.prototype.hasOwnProperty.call(data, "__proto__")).toBe(false);
    });

    it("does not OOM or hang on very long front-matter blocks", () => {
        const lines = new Array(3000).fill("k: v").join("\n");
        const src = `---\n${lines}\n---\n`;
        const start = Date.now();
        parseFrontmatter(src);
        expect(Date.now() - start).toBeLessThan(1000);
    });
});

describe("updateFrontmatter", () => {
    it("updates an existing key and preserves body", () => {
        const input = `---\nname: old\n---\nbody text`;
        const out = updateFrontmatter(input, { name: "new" });
        expect(out).toContain(`name: new`);
        expect(out.endsWith(`body text`)).toBe(true);
    });

    it("adds new keys when missing", () => {
        const out = updateFrontmatter(`---\na: 1\n---\n`, { b: 2 });
        const { data } = parseFrontmatter(out);
        expect(data).toEqual({ a: 1, b: 2 });
    });

    it("adds front matter when source has none", () => {
        const out = updateFrontmatter("body only", { k: "v" });
        expect(out.startsWith("---\n")).toBe(true);
        expect(out).toContain("k: v");
        expect(out.endsWith("body only")).toBe(true);
    });

    it("removes keys set to undefined", () => {
        const out = updateFrontmatter(`---\na: 1\nb: 2\n---\n`, { a: undefined });
        const { data } = parseFrontmatter(out);
        expect(data).toEqual({ b: 2 });
    });
});
