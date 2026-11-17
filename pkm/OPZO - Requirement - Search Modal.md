---
project_code: "OPZO"
id: "OPZO-REQ-search-modal"
date: 2026-02-04
type: requirement
status: completed
---

# Search Modal for Zettelkasten Plugin

## Problem

Implement a Search Modal that allows users to search notes within a configurable target folder, insert wikilinks into active notes, add bidirectional source links, and create/open files seamlessly.

## Acceptance criteria

- [x] Search modal opens from Dashboard Quick Actions
- [x] Search modal opens from command palette
- [x] Target folder can be changed via "Change" button
- [x] Search filters results in real-time
- [x] Tag filter works when enabled
- [x] Double-click adds active note to result's sources
- [x] Insert button inserts wikilink at cursor
- [x] Enter key creates/opens file or opens Dashboard
- [x] Settings has searchDefaultPath control
- [x] Settings organized into 4 tabs with fancy UI
- [x] Dashboard closes when Search/Research/Projects modals open
- [x] Modal width increased and components scale properly
- [x] No duplicate Search buttons in Dashboard

### Settings integration

Default search folder:

- Add `searchDefaultPath: string` to `ZettelkastenSettings` interface
- Default value: `'002-Literature'` in `DEFAULT_SETTINGS`
- Add UI control in Settings → General tab: "Search default folder" text input
- User can change this default path in settings

### Search modal UI

Target folder selection:

- Display current target folder as read-only text (or "(root)" if empty)
- "Change" button opens a folder picker modal (`FuzzySuggestModal`) to select any folder in vault
- When folder changes, refresh search results immediately
- Initial value from `settings.searchDefaultPath`

Unified search/create input:

- Single input field labeled "Search / Create"
- Placeholder: "Search by name or enter filename to create/open"
- Real-time filtering: as user types, filter results by name/basename
- Enter key: if input has value, execute create/open logic; otherwise refresh search
- No separate "Create/Open" button (removed per user feedback)

Tag filter (optional):

- Input field for tags: `#tag1; #tag2` format
- Enable/disable checkbox toggle
- When enabled and tags entered, filter results by matching tags
- Tags extracted from frontmatter and metadata cache

Results display:

- Scrollable list (min-height: 180px, max-height: 280px)
- Each result shows note name (from frontmatter title or basename)
- Single-click: select result (highlighted with accent color)
- Double-click: add current active note to the **double-clicked file's** `sources` frontmatter property
- Empty state: "No results. Try changing the folder or search query."

Action buttons:

- **Open**: Opens selected result file in current tab, closes modal
- **Insert**: Inserts `[[path|name]]` wikilink at cursor in active Markdown editor, closes modal
- **Cancel**: Closes modal
- Buttons disabled/notify if no result selected (for Open/Insert)

Modal dimensions:

- Container: `min-width: 520px`, `width: 90vw`, `max-width: 720px`
- All internal components (rows, inputs, results area) use `width: 100%` with `box-sizing: border-box`
- Responsive layout that scales with viewport

### Functionality

Search logic:

- Filter markdown files by `targetDirectory` (path starts with folder or is in subfolder)
- If `targetDirectory` is empty, search all markdown files
- Filter by search query: substring match on `name` or `basename` (case-insensitive)
- Filter by tags: if enabled, match any tag in filter list against note's tags
- Results update in real-time as user types

Double-click, add to sources:

- Get current active file (`app.workspace.getActiveFile()`)
- Validate: must be markdown file, else show Notice
- Get target file (the double-clicked result)
- Use `app.fileManager.processFrontMatter(targetFile, (fm) => {...})`
- Ensure `fm.sources` is an array
- Build wikilink: `[[activeFile.path|activeFile.basename]]`
- Add to sources array if not already present (avoid duplicates)
- Show success Notice: "Added current note to sources of {result.name}"

Insert wikilink:

- Get active Markdown view (`app.workspace.getActiveViewOfType(MarkdownView)`)
- Validate editor exists, else show Notice
- Build wikilink: `[[selectedResult.path|selectedResult.name]]`
- Insert at cursor: `view.editor.replaceSelection(wikilink)`
- Close modal

Create/open (Enter key):

- Resolve path: `targetDirectory/filename` (add `.md` if missing)
- Check if file exists: `vault.getAbstractFileByPath(path)`
- If exists: open file with `openLinkText`, close modal
- If not exists: open main Zettelkasten Dashboard (`factory.openCreationModal()`), close Search modal

### Integration points

Dashboard Quick Actions:

- Add "Search" button with `search` icon
- Clicking Search: closes Dashboard, opens SearchModal
- Remove Kanban button (no longer needed)

Command registration:

- Register command: `open-zettelkasten-search` ("Open Zettelkasten Search")
- Command opens SearchModal directly

Settings UI reorganization:

- Reorganize settings into 4 tabs: **General**, **Projects**, **Dataview**, **Templates**
- Each tab has icon in navigation
- **General**: Note type paths + Search default folder (card layout with section header)
- **Projects**: Research/Projects root paths + Gantt status colors (card layout)
- **Dataview**: Enable toggle, scripts folder, code block type (card layout)
- **Templates**: Existing template management (unchanged)
- Use fancy UI: section headers with icons, cards, consistent spacing

## Constraints

Edge cases:

- **No active note for double-click**: Show Notice, don't modify file
- **No active editor for Insert**: Show Notice, don't close modal
- **Empty target folder**: Treat as vault root (all markdown files)
- **File not found**: Show appropriate Notice
- **Duplicate sources**: Check before adding to avoid duplicates
- **Modal cleanup**: Remove style element and modal class on close

## Implementation steps

Technical notes:

- Uses `FuzzySuggestModal` for folder selection
- Uses `processFrontMatter` for safe frontmatter updates
- Uses `MarkdownView` and `editor.replaceSelection` for wikilink insertion
- Inline styles scoped to `.zettelkasten-search-modal` and `.zettelkasten-search-modal-container`
- All components use `box-sizing: border-box` for consistent sizing

## Validation

Status checked against `src/` on 2026-11-17:

- `src/main.ts` registers the command `open-zettelkasten-search`.
- `src/modals/dashboard.ts` has one Search quick-access button (icon `search`) that closes the Dashboard before opening `SearchModal`; the Research and Projects buttons also close it first.
- `src/modals/searchModal.ts` uses `FuzzySuggestModal`, the "Search / Create" input, the `#tag1; #tag2` tag filter, a double-click handler that calls `processFrontMatter`, Open and Insert buttons (`openLinkText`, `editor.replaceSelection`), `factory.openCreationModal()` for a missing file, and the scoped styles `min-width: 520px; width: 90vw; max-width: 720px` with results `min-height: 180px; max-height: 280px`.
- `src/types.ts` and `src/constants.ts` define `searchDefaultPath` (default `"002-Literature"`); `src/settings.ts` has the General, Projects, Dataview, and Templates tabs, each with an icon, and a control for `searchDefaultPath`.

## Open decisions

None recorded.
