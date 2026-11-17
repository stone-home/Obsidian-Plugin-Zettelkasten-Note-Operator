---
project_code: "OPZO"
id: "OPZO-REQ-dataview-scripts"
date: 2026-02-05
type: requirement
status: in-progress
---

# Dataview Scripts Management

## Problem

Allow users to view, create, edit, reset, and remove Dataview JS scripts from the plugin Settings. Scripts are loaded from a configurable vault folder; the Settings UI shows a script list and a dedicated code editor modal (CodeMirror) for editing script content. Tab inserts 2 spaces; the editor window uses a reduced width (70% of full).

Context:

- **Dataview Integration**: The plugin loads Dataview JS scripts from a vault folder (`dataviewQueryPath`). Code blocks with a configured language (e.g. `zettelkasten-query`) run these scripts by script id.
- **Goal**: Expose script management in Settings so users can create new scripts, edit existing ones, reset predefined scripts to default, and remove scripts without leaving Obsidian.

## Acceptance criteria

- [x] When Dataview is enabled, changing scripts folder or code block type only refreshes scripts (no duplicate processor registration).
- [x] Settings → Dataview shows a "Scripts" card when Dataview is enabled and an instance exists.
- [x] "Create script" opens the editor in create mode; saving creates the file and refreshes the list.
- [x] Each script row shows name, id (pill), Preview, Edit, Reset (if default exists), Remove.
- [x] Edit opens the editor with current content; Save updates the file and refreshes.
- [x] Tab in the editor inserts 2 spaces and keeps focus in the editor.
- [ ] Editor modal width is 70% of original (minWidth 1176px, width/maxWidth 68.6vw).
- [x] CodeMirror has line numbers, JS syntax highlighting, and One Dark theme.
- [x] Reset restores predefined script content; Remove deletes the file after confirm.
- [x] All relevant tests pass (e.g. getScripts, getScriptContent, createScript, setScriptsFolder).

### Settings: Dataview tab and refresh behavior

Single registration, refresh reuse:

- When Dataview is **enabled** and the user changes settings (e.g. scripts folder or code block type):
  - If `plugin.dataview` already exists: call `plugin.dataview.refresh()` only (reload scripts from new path, do not re-register the code block processor).
  - If `plugin.dataview` does not exist: create a new `DataviewCommand`, call `initialize()` (load scripts + register processor).
- When Dataview is **disabled**: unload and clear `plugin.dataview`.
- **Refresh implementation**: `refresh()` must call `cleanUpFileWatchers()`, `setScriptsFolder(settings.dataviewQueryPath)`, then `onload()` so scripts are reloaded from the current folder without re-registering the markdown processor.

Script list visibility:

- The **Scripts** card is shown only when:
  - Dataview is enabled (`settings.dataviewEnabled === true`), and
  - `plugin.dataview` exists (instance is created when the tab is rendered with Dataview on).
- The card includes a section header (icon + title + short description), a "Create script" button, and a list of scripts.

### Script list UI (Settings)

Header and create:

- **Header**: Icon (e.g. `file-code`), title "Scripts", description: "Manage Dataview JS scripts. Edit, reset to default, or remove."
- **Create script**: One primary button "Create script". On click, open the script editor modal in **create mode** (no existing script; user supplies id, name, and content). On save, call `plugin.dataview.createScript(newId, newName, content)`, then `refresh()` and re-render Settings.

Per-script row, for each script returned by `plugin.dataview.getScripts()`:

- **Display**: Script **name** and **id** (id shown as a pill/badge).
- **Preview**: "Preview" button toggles expansion; when expanded, show a read-only snippet of the script content (from `getScriptContent(script.id)` or "(load script to preview)").
- **Edit**: "Edit" button opens the script editor modal in **edit mode** with current content (from `getScriptContent` or vault read). On save, `vault.modify(file, newContent)`, then `refresh()` and re-render.
- **Reset** (conditional): Shown only for scripts that have a predefined default (e.g. `getDefaultScriptContent(script.id) !== null`). On click, write default content to the script file, then `refresh()` and re-render.
- **Remove**: On click, confirm; then `vault.delete(file)`, `refresh()`, and re-render.

Styling:

- Script list uses a card-style layout: each script is a row with clear separation, pill for id, and grouped action buttons (Preview, Edit, Reset, Remove).
- CSS classes and layout should be consistent with the rest of the Settings UI (e.g. `.zk-scripts-card`, `.zk-dataview-script-row`, `.zk-script-btn-*`).

### Script editor modal

Modes:

- **Create mode** (`script === null`): Show inputs for **Script ID** and **Script Name**, plus the code editor. Save callback receives `(content, newId, newName)`.
- **Edit mode** (existing script): Show heading with script name and id; only the code editor. Save callback receives `(content)`.

Code editor (CodeMirror):

- Use **CodeMirror 6** as the dedicated code window (not a plain textarea).
- **Features**: Line numbers, highlight active line, bracket matching, syntax highlighting for JavaScript, undo/redo (history), One Dark theme.
- **Tab key**: Insert **2 spaces** (not `\t`) and keep focus in the editor (do not move to next control).
- **Content**: Initial value is the script content (or default placeholder for create). Changes are tracked; on Save, submit current document content.

Modal dimensions:

- **Width**: 70% of the original full-width design.
  - `minWidth`: 1176px (was 1680px).
  - `width` and `maxWidth`: 68.6vw (was 98vw).
- Height of the code area is fixed (e.g. 420px) with internal scrolling.

Buttons:

- **Save**: Persist content (and for create mode, id/name); then close modal and refresh Settings/Dataview as needed.
- **Cancel**: Close modal without saving.

Lifecycle:

- On open: Mount CodeMirror in a container, set initial content, wire `onChange` to keep current content in sync.
- On close: Destroy the CodeMirror view, clear container, remove modal-specific classes and inline styles.

### Backend and API

DataviewCommand (or equivalent):

- **refresh()**: `cleanUpFileWatchers()` → `setScriptsFolder(settings.dataviewQueryPath)` → `onload()`. Does not re-register the code block processor.
- **getScripts(category?)**: Return list of script metadata (id, name, filePath, etc.).
- **getScriptContent(scriptId)**: Return cached script body string or `undefined` if not loaded/unknown.
- **createScript(id, name, scriptContent, options?)**: Create script file in the scripts folder and return script metadata; support overwrite and other options as needed.

DataviewJSManager:

- **setScriptsFolder(path)**: Set scripts folder path and clear in-memory scripts/cache so the next `onload()` loads from the new path.
- **getScriptContent(scriptId)**: Return content from cache (e.g. `scriptCache.get(scriptId)`).

Default content:

- **getDefaultScriptContent(id)**: Export a function that returns the default (predefined) script content for a given id, or `null` if not predefined. Used by Settings to show "Reset" and to populate default in the editor when creating from template.

## Constraints

Edge cases:

- **No script file on edit**: If `getScriptContent` returns undefined, read from vault by `script.filePath`; if file missing, use empty string.
- **Create without id/name**: Save should not proceed if id or name is empty in create mode.
- **Modal closed without save**: No persistence; Dataview state unchanged.
- **Concurrent edits**: Last save wins; no conflict resolution required for this feature.

## Implementation steps

Technical notes:

- **CodeMirror**: Use `@codemirror/view`, `@codemirror/state`, `@codemirror/commands`, `@codemirror/language`, `@codemirror/lang-javascript`, `@codemirror/theme-one-dark`. Tab keymap runs before default keymap and dispatches `replaceSelection("  ")`.
- **Modal class**: `DataviewScriptEditorModal`; save callback type: `(content: string, newId?: string, newName?: string) => Promise<void>`.
- **Styles**: Script list and editor modal use classes under `.zk-scripts-card`, `.zk-dataview-script-row`, `.zettelkasten-script-editor-modal`, `.zk-script-editor-codemirror-wrap` (see `modals.css` and related).

## Validation

Status checked against `src/` on 2026-11-17:

- Refresh: `src/dataview/command.ts` `refresh()` calls `cleanUpFileWatchers()`, `setScriptsFolder(...)`, then `onload()`; `src/settings.ts` calls `plugin.dataview.refresh()` when an instance exists and creates a `DataviewCommand` otherwise.
- Settings list: `src/settings.ts` renders the "Scripts" header, Preview, Edit, Reset (when `getDefaultScriptContent` returns content), Remove behind `confirm(...)`, and a "Create script" button that opens `DataviewScriptEditorModal`.
- Editor: `src/modals/dataviewScriptEditorModal.ts` uses `lineNumbers()`, `javascript()`, `oneDark`, and a Tab handler that dispatches `replaceSelection("  ")`.
- Tests: `npm test -- src/__tests__/dataview/manager.test.ts src/__tests__/dataview/command.test.ts --coverage=false` passed (2 suites, 52 tests) on 2026-11-17, including `setScriptsFolder`, `getScriptContent`, and `getDefaultScriptContent`.
- Not met as written: `src/modals/dataviewScriptEditorModal.ts` sets the modal width to `min(1176px, 92vw)` ("never wider than 92% of the window"), not `minWidth 1176px` with `width`/`maxWidth` `68.6vw`.

## Open decisions

- Whether the current modal width `min(1176px, 92vw)` replaces the 68.6vw width criterion, so the requirement can be updated and closed.
