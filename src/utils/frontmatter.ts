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
export function generateFrontmatter(properties: Record<string, string | number | boolean>): string {
    const lines: string[] = ["---"];

    for (const [key, value] of Object.entries(properties)) {
        lines.push(`${key}: ${formatYamlValue(value)}`);
    }

    if (!("completed" in properties)) {
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

    for (let i = 1; i < endIndex; i++) {
        const line = lines[i];
        const colonIndex = line.indexOf(":");
        if (colonIndex === -1) continue;

        const key = line.substring(0, colonIndex).trim();
        let value = line.substring(colonIndex + 1).trim();

        // Remove surrounding quotes
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }

        properties[key] = value;
    }

    const bodyLines = lines.slice(endIndex + 1);
    const body = bodyLines.join("\n").trim();

    return { properties, body };
}
