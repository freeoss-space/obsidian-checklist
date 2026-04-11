/**
 * Minimal, hardened YAML front-matter parser/serializer.
 *
 * We intentionally avoid a full YAML library:
 * - The surface we care about is small (scalars, inline flow lists,
 *   block lists, nulls, simple quoted strings, hash comments).
 * - A smaller parser means a smaller plugin bundle and fewer supply-chain
 *   concerns.
 * - The parser is defensive: malformed input yields an empty object
 *   rather than throwing — the plugin stays responsive on broken notes.
 *
 * Threat model:
 * - Input comes from the user's own vault, but notes can be authored by
 *   anyone and synced from anywhere. The parser must not execute content,
 *   must not loop unboundedly on pathological inputs, and must not
 *   interpret JS-like expressions.
 */

const FENCE = "---";

export interface ParsedFrontmatter {
    data: Record<string, unknown>;
    body: string;
}

interface Split {
    block: string;
    body: string;
}

/** Split a file into its front-matter block and the remaining body. */
function splitFrontmatter(src: string): Split | null {
    // Tolerate a BOM at the start of the file.
    let s = src;
    if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
    if (!s.startsWith(FENCE)) return null;
    // The opening fence must be on its own line.
    const afterOpen = s.slice(FENCE.length);
    if (afterOpen[0] !== "\n" && afterOpen[0] !== "\r") return null;
    const rest = afterOpen.replace(/^\r?\n/, "");
    // Look for the closing fence on its own line.
    const closeRe = /\r?\n---\s*(?:\r?\n|$)/;
    const match = closeRe.exec(rest);
    if (!match || match.index === undefined) return null;
    return {
        block: rest.slice(0, match.index),
        body: rest.slice(match.index + match[0].length),
    };
}

const SCALAR_MAX_LEN = 4096;

/** Parse a single scalar value (string, number, boolean, null). */
function parseScalar(raw: string): unknown {
    let v = raw.trim();
    if (v.length > SCALAR_MAX_LEN) v = v.slice(0, SCALAR_MAX_LEN);
    // Strip trailing comment unless inside quotes.
    v = stripInlineComment(v).trim();
    if (v === "" || v === "null" || v === "~") return null;
    if (v === "true") return true;
    if (v === "false") return false;
    // Quoted strings.
    if (v.length >= 2 && v[0] === '"' && v[v.length - 1] === '"') {
        return unescapeDoubleQuoted(v.slice(1, -1));
    }
    if (v.length >= 2 && v[0] === "'" && v[v.length - 1] === "'") {
        return v.slice(1, -1).replace(/''/g, "'");
    }
    // Number?
    if (/^-?\d+$/.test(v)) {
        const n = Number(v);
        if (Number.isSafeInteger(n)) return n;
    }
    if (/^-?\d+\.\d+$/.test(v)) {
        const n = Number(v);
        if (Number.isFinite(n)) return n;
    }
    return v;
}

function unescapeDoubleQuoted(s: string): string {
    return s.replace(/\\(.)/g, (_m, c) => {
        switch (c) {
            case "n":
                return "\n";
            case "t":
                return "\t";
            case "\\":
                return "\\";
            case '"':
                return '"';
            default:
                return c;
        }
    });
}

/** Strip a `# comment` that is outside of quoted strings. */
function stripInlineComment(v: string): string {
    let inS: '"' | "'" | null = null;
    for (let i = 0; i < v.length; i++) {
        const ch = v[i];
        if (inS) {
            if (ch === "\\" && i + 1 < v.length) {
                i++;
                continue;
            }
            if (ch === inS) inS = null;
            continue;
        }
        if (ch === '"' || ch === "'") {
            inS = ch;
            continue;
        }
        // Only treat as comment if preceded by whitespace or at start.
        if (ch === "#" && (i === 0 || /\s/.test(v[i - 1]))) {
            return v.slice(0, i);
        }
    }
    return v;
}

/** Parse an inline flow list like `[a, b, "c d"]`. */
function parseFlowList(raw: string): unknown[] | null {
    const v = raw.trim();
    if (v.length < 2 || v[0] !== "[" || v[v.length - 1] !== "]") return null;
    const inner = v.slice(1, -1);
    const parts: string[] = [];
    let depth = 0;
    let inS: '"' | "'" | null = null;
    let start = 0;
    for (let i = 0; i < inner.length; i++) {
        const ch = inner[i];
        if (inS) {
            if (ch === "\\" && i + 1 < inner.length) {
                i++;
                continue;
            }
            if (ch === inS) inS = null;
            continue;
        }
        if (ch === '"' || ch === "'") {
            inS = ch;
            continue;
        }
        if (ch === "[" || ch === "{") depth++;
        else if (ch === "]" || ch === "}") depth--;
        else if (ch === "," && depth === 0) {
            parts.push(inner.slice(start, i));
            start = i + 1;
        }
    }
    parts.push(inner.slice(start));
    return parts
        .map((p) => p.trim())
        .filter((p) => p.length > 0)
        .map((p) => parseScalar(p));
}

const MAX_LINES = 2000;

/** Keys that would mutate Object.prototype if assigned via bracket notation. */
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);

export function parseFrontmatter(src: string): ParsedFrontmatter {
    const split = splitFrontmatter(src);
    if (!split) return { data: {}, body: src };
    // Use a null-prototype object so accidental assignments to `__proto__`,
    // `constructor`, etc. do not reach Object.prototype. We still reject such
    // keys explicitly below, but defense in depth.
    const data: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    const lines = split.block.split(/\r?\n/);
    let i = 0;
    let ok = true;
    const len = Math.min(lines.length, MAX_LINES);
    while (i < len) {
        const line = lines[i];
        // Blank line / comment line: skip.
        if (line.trim() === "" || /^\s*#/.test(line)) {
            i++;
            continue;
        }
        // `key: value` — key must be a plain identifier.
        const m = /^([A-Za-z_][A-Za-z0-9_\-]*)\s*:(.*)$/.exec(line);
        if (!m) {
            ok = false;
            break;
        }
        const key = m[1];
        const rest = m[2];
        // Skip dangerous keys to block prototype-pollution style attacks via
        // hostile or accidentally-authored front matter.
        if (DANGEROUS_KEYS.has(key)) {
            i++;
            continue;
        }
        // Block list? key: followed by nothing and next non-empty line starts with "- ".
        const restTrim = rest.trim();
        if (restTrim === "") {
            // Peek ahead for block-list items.
            let j = i + 1;
            while (j < len && /^\s*$/.test(lines[j])) j++;
            if (j < len && /^(\s*)-\s+/.test(lines[j])) {
                const list: unknown[] = [];
                while (j < len) {
                    const next = lines[j];
                    if (/^\s*$/.test(next)) {
                        j++;
                        continue;
                    }
                    const lm = /^(\s*)-\s+(.*)$/.exec(next);
                    if (!lm) break;
                    list.push(parseScalar(lm[2]));
                    j++;
                }
                data[key] = list;
                i = j;
                continue;
            }
            // Bare `key:` with no value and no list is null.
            data[key] = null;
            i++;
            continue;
        }
        if (restTrim[0] === "[") {
            const parsed = parseFlowList(restTrim);
            if (parsed === null) {
                ok = false;
                break;
            }
            data[key] = parsed;
            i++;
            continue;
        }
        data[key] = parseScalar(rest);
        i++;
    }
    if (!ok) return { data: {}, body: split.body };
    return { data, body: split.body };
}

const UNSAFE_SCALAR = /[:#\n\r"'\[\]{}&*!|>%@`]/;
const UNSAFE_IN_FLOW = /[\s,:#\n\r"'\[\]{}&*!|>%@`]/;

function quote(s: string): string {
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function serializeFlowItem(v: unknown): string {
    if (v === null || v === undefined) return '""';
    if (typeof v === "boolean") return v ? "true" : "false";
    if (typeof v === "number") return Number.isFinite(v) ? String(v) : '""';
    const s = String(v);
    if (s === "" || UNSAFE_IN_FLOW.test(s)) return quote(s);
    return s;
}

function serializeValue(v: unknown): string {
    if (v === null || v === undefined) return "";
    if (typeof v === "boolean") return v ? "true" : "false";
    if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
    if (Array.isArray(v)) {
        return `[${v.map(serializeFlowItem).join(", ")}]`;
    }
    const s = String(v);
    if (UNSAFE_SCALAR.test(s) || s.trim() !== s || s === "") return quote(s);
    return s;
}

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_\-]*$/;

export function serializeFrontmatter(data: Record<string, unknown>): string {
    const lines: string[] = ["---"];
    for (const key of Object.keys(data)) {
        if (DANGEROUS_KEYS.has(key)) continue;
        if (!KEY_RE.test(key)) continue;
        const v = data[key];
        if (v === undefined) continue;
        lines.push(`${key}: ${serializeValue(v)}`);
    }
    lines.push("---", "");
    return lines.join("\n");
}

/**
 * Apply a patch to the front matter of a file and return the updated file
 * contents. Keys set to `undefined` are removed. New keys are appended.
 */
export function updateFrontmatter(src: string, patch: Record<string, unknown>): string {
    const { data, body } = parseFrontmatter(src);
    const merged: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const k of Object.keys(data)) merged[k] = data[k];
    for (const k of Object.keys(patch)) {
        if (DANGEROUS_KEYS.has(k)) continue;
        if (!KEY_RE.test(k)) continue;
        const v = patch[k];
        if (v === undefined) delete merged[k];
        else merged[k] = v;
    }
    return serializeFrontmatter(merged) + body;
}
