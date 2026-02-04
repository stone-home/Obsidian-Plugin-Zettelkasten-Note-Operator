# Feature Requirement: Search Modal for Zettelkasten Plugin

## Overview

Implement a Search Modal that allows users to search notes within a configurable target folder, insert wikilinks into active notes, add bidirectional source links, and create/open files seamlessly.

## Requirements

### 1. Settings Integration

**1.1 Default Search Folder**
- Add `searchDefaultPath: string` to `ZettelkastenSettings` interface
- Default value: `'002-Literature'` in `DEFAULT_SETTINGS`
- Add UI control in Settings → General tab: "Search default folder" text input
- User can change this default path in settings

### 2. Search Modal UI

**2.1 Target Folder Selection**
- Display current target folder as read-only text (or "(root)" if empty)
- "Change" button opens a folder picker modal (`FuzzySuggestModal`) to select any folder in vault
- When folder changes, refresh search results immediately
- Initial value from `settings.searchDefaultPath`

**2.2 Unified Search/Create Input**
- Single input field labeled "Search / Create"
- Placeholder: "Search by name or enter filename to create/open"
- Real-time filtering: as user types, filter results by name/basename
- Enter key: if input has value, execute create/open logic; otherwise refresh search
- No separate "Create/Open" button (removed per user feedback)

**2.3 Tag Filter (Optional)**
- Input field for tags: `#tag1; #tag2` format
- Enable/disable checkbox toggle
- When enabled and tags entered, filter results by matching tags
- Tags extracted from frontmatter and metadata cache

**2.4 Results Display**
- Scrollable list (min-height: 180px, max-height: 280px)
- Each result shows note name (from frontmatter title or basename)
- Single-click: select result (highlighted with accent color)
- Double-click: add current active note to the **double-clicked file's** `sources` frontmatter property
- Empty state: "No results. Try changing the folder or search query."

**2.5 Action Buttons**
- **Open**: Opens selected result file in current tab, closes modal
- **Insert**: Inserts `[[path|name]]` wikilink at cursor in active Markdown editor, closes modal
- **Cancel**: Closes modal
- Buttons disabled/notify if no result selected (for Open/Insert)

**2.6 Modal Dimensions**
- Container: `min-width: 520px`, `width: 90vw`, `max-width: 720px`
- All internal components (rows, inputs, results area) use `width: 100%` with `box-sizing: border-box`
- Responsive layout that scales with viewport

### 3. Functionality

**3.1 Search Logic**
- Filter markdown files by `targetDirectory` (path starts with folder or is in subfolder)
- If `targetDirectory` is empty, search all markdown files
- Filter by search query: substring match on `name` or `basename` (case-insensitive)
- Filter by tags: if enabled, match any tag in filter list against note's tags
- Results update in real-time as user types

**3.2 Double-Click: Add to Sources**
- Get current active file (`app.workspace.getActiveFile()`)
- Validate: must be markdown file, else show Notice
- Get target file (the double-clicked result)
- Use `app.fileManager.processFrontMatter(targetFile, (fm) => {...})`
- Ensure `fm.sources` is an array
- Build wikilink: `[[activeFile.path|activeFile.basename]]`
- Add to sources array if not already present (avoid duplicates)
- Show success Notice: "Added current note to sources of {result.name}"

**3.3 Insert Wikilink**
- Get active Markdown view (`app.workspace.getActiveViewOfType(MarkdownView)`)
- Validate editor exists, else show Notice
- Build wikilink: `[[selectedResult.path|selectedResult.name]]`
- Insert at cursor: `view.editor.replaceSelection(wikilink)`
- Close modal

**3.4 Create/Open (Enter Key)**
- Resolve path: `targetDirectory/filename` (add `.md` if missing)
- Check if file exists: `vault.getAbstractFileByPath(path)`
- If exists: open file with `openLinkText`, close modal
- If not exists: open main Zettelkasten Dashboard (`factory.openCreationModal()`), close Search modal

### 4. Integration Points

**4.1 Dashboard Quick Actions**
- Add "Search" button with `search` icon
- Clicking Search: closes Dashboard, opens SearchModal
- Remove Kanban button (no longer needed)

**4.2 Command Registration**
- Register command: `open-zettelkasten-search` ("Open Zettelkasten Search")
- Command opens SearchModal directly

**4.3 Settings UI Reorganization**
- Reorganize settings into 4 tabs: **General**, **Projects**, **Dataview**, **Templates**
- Each tab has icon in navigation
- **General**: Note type paths + Search default folder (card layout with section header)
- **Projects**: Research/Projects root paths + Gantt status colors (card layout)
- **Dataview**: Enable toggle, scripts folder, code block type (card layout)
- **Templates**: Existing template management (unchanged)
- Use fancy UI: section headers with icons, cards, consistent spacing

### 5. Edge Cases

- **No active note for double-click**: Show Notice, don't modify file
- **No active editor for Insert**: Show Notice, don't close modal
- **Empty target folder**: Treat as vault root (all markdown files)
- **File not found**: Show appropriate Notice
- **Duplicate sources**: Check before adding to avoid duplicates
- **Modal cleanup**: Remove style element and modal class on close

## Acceptance Criteria

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

## Technical Notes

- Uses `FuzzySuggestModal` for folder selection
- Uses `processFrontMatter` for safe frontmatter updates
- Uses `MarkdownView` and `editor.replaceSelection` for wikilink insertion
- Inline styles scoped to `.zettelkasten-search-modal` and `.zettelkasten-search-modal-container`
- All components use `box-sizing: border-box` for consistent sizing
