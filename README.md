# Checklist — Obsidian Plugin

Create **Bases-like checklist views** in Obsidian. Each checklist is a folder of markdown notes; each note is an item with front-matter properties and a checkbox for completion.

> Status: v0.2.4 — actively iterating. See [`TASKS.md`](TASKS.md) for the roadmap.

---

## Features

- **Checklists from folders.** Pick a folder, define properties, get a Bases-style table of every note inside.
- **Typed properties.** Built-in property types: `text`, `number`, `date`, `checkbox`, `dropdown`. New types planned (multi-select, url, rating, relation, formula).
- **Toggle completion** straight from the view — writes back to the note's front matter.
- **Add / share items.** Modal-based item creation, plus a Share-to-Checklist modal for the share intent on mobile.
- **Sorting** _(utility shipped, UI in progress)_ — `sortItems()` supports any built-in field or custom property, ascending/descending, with stable ordering and "missing values last".
- **Filtering & search** _(utility shipped, UI in progress)_ — `filterItems()` composes a free-text query (name + description + property values), an `all|active|done` status filter, and per-property equality / multi-value (OR) chips.
- **Export** to Markdown (more formats planned: JSON, YAML, HTML, ICS).
- **Mobile-friendly.** `isDesktopOnly: false`.

---

## Installation

### Manual

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest [release](../../releases).
2. Drop them into `<vault>/.obsidian/plugins/obsidian-checklist/`.
3. In Obsidian → Settings → Community plugins, enable **Checklist**.

### From source

```bash
git clone https://github.com/freeoss-space/obsidian-checklist
cd obsidian-checklist
npm install
npm run build         # bundles main.js
npm test              # runs the Jest suite
```

Symlink or copy the built files into your vault's plugin folder.

---

## Usage

1. Open the **Checklist** view from the ribbon (or the command palette: `Checklist: Open view`).
2. Click **New checklist** and choose:
   - A **name**.
   - A **folder** in your vault (the plugin will treat every `.md` file inside as an item).
   - Any **properties** you want (e.g. `priority: number`, `status: dropdown[todo,doing,done]`, `due: date`).
3. Add items via **Add item** — the modal collects the name, description, and any defined properties, then writes a new markdown file with YAML front matter.
4. Tick the checkbox on a row to mark it complete. Completion is persisted as `completed: true` in the note's front matter.

### Example item file

```markdown
---
priority: 2
status: doing
due: 2026-04-20
completed: false
---

# Read "Designing Data-Intensive Applications"

A few chapters per week.
```

### Programmatic sort & filter

The `src/utils/sort.ts` and `src/utils/filter.ts` helpers are pure and reusable:

```ts
import { sortItems } from "src/utils/sort";
import { filterItems } from "src/utils/filter";

const visible = filterItems(items, {
    query: "book",
    status: "active",
    properties: { status: ["todo", "doing"] },
});

const ordered = sortItems(visible, { key: "due", dir: "asc" });
```

---

## Development

- **Language:** TypeScript, bundled with esbuild.
- **Tests:** Jest + ts-jest. Run `npm test`. We follow **red-green TDD** — every new utility/service ships with failing tests first, then the minimal implementation to make them pass.
- **Layout:**
  - `src/models/` — type definitions.
  - `src/services/` — `ChecklistManager` orchestrates vault I/O.
  - `src/utils/` — pure helpers (`frontmatter`, `sort`, `filter`, …).
  - `src/views/`, `src/modals/` — Obsidian UI.
  - `tests/` — mirrors `src/`.

### Test status

```
Test Suites: 6 passed
Tests:       71 passed
```

---

## Roadmap

See [`TASKS.md`](TASKS.md). Highlights for the next few releases:

| Version | Theme       | Headline items                                              |
| ------- | ----------- | ----------------------------------------------------------- |
| v0.3    | Usability   | Sort, filter, inline edit, column visibility, quick-add    |
| v0.4    | Power       | Grouping, new property types, bulk actions, templates      |
| v0.5    | Layouts     | Board / Calendar / Gallery, detail pane, virtualization    |
| v0.6    | Workflow    | Recurring items, reminders, subtasks, more export formats  |
| v0.7    | Integrations| Tasks plugin interop, URI scheme, external sync providers  |

---

## Contributing

PRs welcome. Please:

1. Branch from `main`.
2. Add tests first (red), then code (green).
3. Run `npm test` and `npm run build` before pushing.

---

## License

See [`LICENSE`](LICENSE).
