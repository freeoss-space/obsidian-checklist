/**
 * Checks if a string value needs YAML quoting (contains special characters).
 */
function needsQuoting(value: string): boolean {
    return (
        value.includes(":") ||
        value.includes("#") ||
        value.includes("'") ||
        value.includes('"') ||
        value.includes("\n") ||
        value.startsWith(" ") ||
        value.endsWith(" ") ||
        value === "true" ||
        value === "false" ||
        value === "null" ||
        /^\d{4}-\d{2}-\d{2}/.test(value)
    );
}

/**
 * Formats a single value for YAML output.
 */
function formatYamlValue(value: string | number | boolean): string {
    if (typeof value === "boolean" || typeof value === "number") {
        return String(value);
    }
    if (needsQuoting(value)) {
        return `"${value.replace(/"/g, '\\"')}"`;
    }
    return value;
}

/**
 * Generates YAML front matter string from a properties record.
 * Always includes a `completed: false` field.
 */
export function generateFrontmatter(
    properties: Record<string, string | number | boolean>,
    options: { includeCompleted?: boolean } = {}
): string {
    const includeCompleted = options.includeCompleted !== false;
    const lines: string[] = ["---"];

    for (const [key, value] of Object.entries(properties)) {
        lines.push(`${key}: ${formatYamlValue(value)}`);
    }

    if (includeCompleted && !("completed" in properties)) {
        lines.push("completed: false");
    }

    lines.push("---");
    return lines.join("\n");
}

export interface ParsedFrontmatter {
    properties: Record<string, string>;
    body: string;
}

/**
 * Parses YAML front matter and body from a markdown string.
 * Uses simple line-by-line parsing (no external YAML library needed).
 * Handles scalar values, quoted strings, YAML list items (- value),
 * and skips comment lines (# ...).
 */
export function parseFrontmatter(content: string): ParsedFrontmatter {
    const trimmed = content.trim();

    if (!trimmed.startsWith("---")) {
        return { properties: {}, body: trimmed };
    }

    const lines = trimmed.split("\n");
    let endIndex = -1;

    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === "---") {
            endIndex = i;
            break;
        }
    }

    if (endIndex === -1) {
        return { properties: {}, body: trimmed };
    }

    const properties: Record<string, string> = {};
    let lastKey: string | null = null;
    const listAccumulator: string[] = [];

    const flushList = () => {
        if (lastKey !== null && listAccumulator.length > 0) {
            properties[lastKey] = listAccumulator.join(", ");
            listAccumulator.length = 0;
        }
    };

    for (let i = 1; i < endIndex; i++) {
        const line = lines[i];

        // Skip YAML comment lines
        if (line.trimStart().startsWith("#")) continue;

        // YAML list item (indented "- value")
        const listMatch = line.match(/^[ \t]+-[ \t]+(.*)/);
        if (listMatch) {
            listAccumulator.push(listMatch[1].trim());
            continue;
        }

        // Flush any accumulated list before processing a new key
        flushList();

        const colonIndex = line.indexOf(":");
        if (colonIndex === -1) continue;

        const key = line.substring(0, colonIndex).trim();
        if (!key) continue;
        let value = line.substring(colonIndex + 1).trim();

        // Remove surrounding quotes, unescaping inner escaped quotes
        if (value.startsWith('"') && value.endsWith('"')) {
            value = value.slice(1, -1).replace(/\\"/g, '"');
        } else if (value.startsWith("'") && value.endsWith("'")) {
            value = value.slice(1, -1).replace(/''/g, "'");
        }

        lastKey = key;
        properties[key] = value;
    }

    // Flush any trailing list
    flushList();

    const bodyLines = lines.slice(endIndex + 1);
    const body = bodyLines.join("\n").trim();

    return { properties, body };
}
