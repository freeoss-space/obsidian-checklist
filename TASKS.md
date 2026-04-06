# TASKS — Feature Planning

Planning doc for the Obsidian **Checklist** plugin (v0.2.3). Each feature is sized roughly S/M/L and lists user value, design notes, files touched, and acceptance criteria. Items are ordered by suggested priority within each section.

---

## 1. Core Data Model

### 1.1 Sorting & ordering (M)
- **Why:** Items currently render in vault order. Users need to prioritize.
- **Design:**
  - Add `sortBy` + `sortDir` to `ChecklistDefinition` (default `name asc`).
  - Sort by any property, plus pseudo-fields `name`, `completed`, `createdAt`, `mtime`.
  - Add manual ordering via an optional `order` numeric front matter key + drag handles.
- **Files:** `src/models/types.ts`, `src/services/ChecklistManager.ts`, `src/views/ChecklistView.ts`.
- **Acceptance:** Header click toggles sort; persists per checklist; manual reorder writes `order` to front matter.

### 1.2 Filtering & search (M)
- **Why:** Long checklists are hard to scan.
- **Design:** Toolbar input filters by name/description/property values; chip filters per property (multi-select for dropdown, range for number/date, all/active/done for checkbox). Fuzzy match for text.
- **Files:** `ChecklistView.ts`, new `src/utils/filter.ts`.
- **Acceptance:** Filters compose; clearing restores; state persists in view (not settings).

### 1.3 Grouping (M)
- **Why:** "Bases-like" experience implies grouping by property.
- **Design:** Group by any property or completion state. Collapsible groups, counts in headers.
- **Files:** `ChecklistView.ts`.
- **Acceptance:** Group toggle in toolbar; remembered per checklist.

### 1.4 New property types (M)
- **Add:** `multi-select` (tags), `url`, `rating` (1–5 stars), `relation` (link to another note), `formula` (read-only computed).
- **Files:** `models/types.ts`, `utils/frontmatter.ts`, `AddItemModal.ts`, `ChecklistView.ts`.
- **Acceptance:** Each type has editor + renderer + validation + tests.

### 1.5 Required / validated fields (S)
- **Why:** Prevent malformed items.
- **Design:** `required: boolean`, `validation?: { min, max, regex }` on `PropertyDefinition`. Modal blocks save on invalid.
- **Files:** modals + `frontmatter.ts`.

---

## 2. Views & UX

### 2.1 Inline edit cells (M)
- Click a cell → edit in place; Enter/blur saves to front matter.
- Files: `ChecklistView.ts`, `ChecklistManager.updateItemProperty`.
- AC: Works for all property types; undo via Ctrl+Z reverts file write.

### 2.2 Bulk actions (S)
- Multi-select rows (checkbox column + shift-click). Bulk: complete, delete, set property, move folder.
- Files: `ChecklistView.ts`, `ChecklistManager.ts`.

### 2.3 Alternative layouts (L)
- **Board (Kanban):** Group-by becomes columns; drag between columns updates property.
- **Calendar:** Items with a date property render on a month grid.
- **Gallery:** Card grid with optional thumbnail (first image in note).
- Files: new `src/views/ChecklistBoardView.ts`, `ChecklistCalendarView.ts`, `ChecklistGalleryView.ts`; toolbar layout switcher.
- AC: Layout choice persists per checklist; switching does not reload all data.

### 2.4 Detail / preview pane (M)
- Split pane: list left, selected item rendered (front matter form + markdown body) right.
- Files: `ChecklistView.ts`, new `ItemDetailPane.ts`.

### 2.5 Column visibility & widths (S)
- Show/hide columns; remember widths. Persist in `ChecklistDefinition.viewState`.

### 2.6 Mobile polish (S)
- Compact rows, swipe-to-complete, swipe-to-delete, larger touch targets. Test on Obsidian mobile.

### 2.7 Theming / density (S)
- Compact / comfortable density toggle; respect Obsidian accent color in `styles.css`.

---

## 3. Productivity Features

### 3.1 Templates (M)
- Per-checklist item template (front matter defaults + body skeleton). New items prefilled.
- Files: `ChecklistDefinition.template`, `AddItemModal.ts`, settings UI.

### 3.2 Recurring items (M)
- Mark item as recurring (`every: 1d|1w|RRULE`). On complete, auto-create next occurrence with rolled date.
- Files: `ChecklistManager.completeItem`, new `utils/recurrence.ts`.
- AC: Round-trip with daily/weekly/monthly; tests for DST.

### 3.3 Reminders / due dates (M)
- For date properties marked as "due", show overdue badge, sort, and (desktop) optional system notification on load.
- Files: `ChecklistView.ts`, `main.ts` startup scan.

### 3.4 Subtasks / dependencies (L)
- Parent/child via `parent: [[note]]` or `subtasks` array. Tree rendering, completion roll-up.
- Files: `models/types.ts`, `ChecklistManager.ts`, `ChecklistView.ts`.

### 3.5 Quick-add bar (S)
- Toolbar input: type name + Enter creates an item with defaults. No modal.

### 3.6 Command palette commands (S)
- "Complete next due item", "Toggle completion of focused item", "Jump to checklist…", "Add item to <name>" per checklist.

### 3.7 Hotkeys (S)
- Configurable shortcuts: j/k navigate, x toggle complete, e edit, n new.

---

## 4. Import / Export / Sharing

### 4.1 More export formats (S)
- Add JSON, YAML, HTML, ICS (for date-bearing items). Already has Markdown.
- Files: `ChecklistManager.export*`, sidebar menu, settings.

### 4.2 CSV import (M)
- Pick CSV → map columns to properties → preview → bulk-create notes.
- Files: new `modals/ImportCsvModal.ts`.

### 4.3 Sync from external (L)
- Pluggable sources: Todoist / GitHub Issues / iCal subscription. Read-only first, write-back later.
- AC: Provider interface; one reference impl; settings store credentials in vault `data.json` (warn user).

### 4.4 Public share (web) — out of scope (note)
- Document why not (privacy, no server). Keep as non-goal.

---

## 5. Quality, Performance, Reliability

### 5.1 Incremental indexing (M)
- Currently full rescans on file change. Subscribe to `vault.on('create'|'modify'|'delete'|'rename')` and patch the in-memory list.
- Files: `ChecklistManager.ts`.
- AC: Vaults with 5k notes update under 50ms per change.

### 5.2 Lazy rendering / virtualization (M)
- Render only visible rows for >200 items. Simple windowing, no external dep.
- Files: `ChecklistView.ts`.

### 5.3 Front-matter parser hardening (S)
- Handle quoted values, lists, multiline strings, comments. Add fuzz tests.
- Files: `utils/frontmatter.ts`, `tests/utils/`.

### 5.4 Error surfacing (S)
- Replace silent catches with user `Notice`s; add "Checklist: show last error" command.

### 5.5 Settings migration (S)
- Add `settingsVersion`; pure migration functions; tests per version bump.

### 5.6 Test coverage (ongoing)
- Target ≥80% on `services/`, `utils/`, `models/`. Add view smoke tests with jsdom mocks.

---

## 6. Integrations

### 6.1 Dataview compatibility (S)
- Document property naming so Dataview queries can read checklist notes; add example queries to README.

### 6.2 Obsidian Tasks plugin interop (M)
- Optionally read `- [ ]` lines inside a note as subtasks; mirror completion both ways.

### 6.3 URI / share intent extensions (S)
- Existing `ShareToChecklistModal` only for share intent. Add `obsidian://checklist?action=add&list=…&name=…` for automation (Shortcuts, Tasker).

### 6.4 Bases plugin parity (M)
- Track upstream Bases features; maintain a compatibility matrix in README.

---

## 7. Documentation & Onboarding

### 7.1 First-run wizard (S)
- On first load, offer to create a sample "Reading list" checklist with curated properties.

### 7.2 README overhaul (S)
- Screenshots/GIFs per layout, property type table, FAQ, troubleshooting.

### 7.3 In-app help (S)
- "?" button in toolbar opens a modal explaining current view + shortcuts.

### 7.4 Contributor docs (S)
- Architecture diagram, data flow, how to add a new property type.

---

## 8. Release Engineering

### 8.1 CI (S)
- GitHub Action: install, `npm run build`, `npm test`, lint. Required check on PRs.

### 8.2 Release script (S)
- Tag → build → attach `main.js`, `manifest.json`, `styles.css` to GitHub release. Verify `versions.json` bump.

### 8.3 Linting & formatting (S)
- Add ESLint + Prettier configs aligned with Obsidian sample plugin.

### 8.4 Bundle size budget (S)
- Track `main.js` size in CI; fail if >250KB.

---

## Suggested Roadmap

**v0.3 — Usability**
- 1.1 Sorting, 1.2 Filtering, 2.1 Inline edit, 2.5 Columns, 3.5 Quick-add, 5.3 Parser hardening, 8.1 CI.

**v0.4 — Power**
- 1.3 Grouping, 1.4 New property types, 2.2 Bulk actions, 3.1 Templates, 5.1 Incremental indexing.

**v0.5 — Layouts**
- 2.3 Board/Calendar/Gallery, 2.4 Detail pane, 5.2 Virtualization.

**v0.6 — Workflow**
- 3.2 Recurring, 3.3 Reminders, 3.4 Subtasks, 4.1 Export formats, 4.2 CSV import.

**v0.7 — Integrations**
- 6.2 Tasks interop, 6.3 URI, 4.3 External sync (one provider).

---

## Open Questions
- Where should view state (filters, sort, columns) live: per-checklist in `data.json`, or per-leaf in workspace state?
- Are mobile-only constraints worth a separate compact view, or should one layout adapt?
- Should "formula" properties be JS expressions (powerful, unsafe) or a small DSL (safe, limited)?
- Multi-vault / sync conflicts: any custom merge logic needed for `order` field, or rely on Obsidian Sync?
