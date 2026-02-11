# Zettelkasten Operator — Architecture & Maintenance Guide

This document describes the plugin’s architecture, how components communicate, and **how to debug issues** when maintaining the project. For high-level overview and usage examples, see the [README Architecture section](../README.md#architecture).

---

## Table of Contents

1. [High-Level Architecture](#1-high-level-architecture)
2. [Component Reference](#2-component-reference)
3. [Entry Points & Call Flow](#3-entry-points--call-flow)
4. [Communication & Data Flow](#4-communication--data-flow)
5. [Debugging Guide for New Maintainers](#5-debugging-guide-for-new-maintainers)
6. [Diagram Index](#6-diagram-index)

---

## 1. High-Level Architecture

The plugin is structured in four layers:

| Layer | Location | Responsibility |
|-------|----------|-----------------|
| **Plugin core** | `main.ts`, `settings.ts`, `types.ts`, `constants.ts` | Bootstrap, settings UI, global API (`window.ZettelkastenOperator`), commands |
| **Service layer** | `service/` | Note creation, research/code project management, draft compile, AI prompt, GitHub |
| **Dataview layer** | `dataview/` | Custom code-block processor, script loading, file watchers, execution via Dataview API |
| **UI layer** | `modals/`, `styles/` | Dashboard, search, template picker, project modals |

- **Single source of truth**: `ZettelkastenSettings` in `types.ts`; defaults in `constants.ts`.
- **Note creation**: All new notes go through `markdown-note-orm` (`LibFactory.createByType`) — used by `NoteFactory`, `ResearchManager`, and `CodeProjectManager`.
- **Dataview scripts** run in note context; they call `window.ZettelkastenOperator` to create items (objectives, drafts, requirements, etc.) or refresh code projects.

---

## 2. Component Reference

### 2.1 Plugin Core

| File | Purpose | Key exports / usage |
|------|---------|----------------------|
| **main.ts** | Plugin entry. Creates `NoteFactory`, optional `DataviewCommand`, registers commands and ribbon, exposes `window.ZettelkastenOperator`. | `MyPlugin` (default export). Commands: `create-zettel-note`, `open-zettelkasten-search`, `compile-current-draft`, `generate-ai-prompt`. |
| **settings.ts** | Settings tab with 4 tabs: General, Projects, Dataview, Templates. Renders path inputs, Gantt colors, template list/detail. | `SampleSettingTab`. Toggling Dataview recreates `DataviewCommand`. |
| **types.ts** | Shared interfaces: `ZettelkastenSettings`, `INoteOption`, `NoteCategory`, `IGanttStatusColorMap`. | Used by main, settings, services, modals. |
| **constants.ts** | Default settings, Gantt color options, prefix placeholders, `DEFAULT_NOTE_CATEGORIES`. | Imported by main, settings, factory/dashboard. |
| **logger.ts** | Central logging; supports debug mode and context loggers. | `Logger`, `ContextLogger`; used across services and dataview. |

### 2.2 Service Layer

| File | Purpose | How to call |
|------|---------|-------------|
| **service/factory.ts** | Creates Zettel notes by type (fleeting/literature/atom/permanent) with optional template and extra frontmatter. | From main: `factory.openCreationModal()`, `factory.createZettel()`, `factory.loadNote()`. From Dashboard: callback uses `createZettel`. |
| **service/projects/researchManager.ts** | Research project lifecycle: create project/dashboard, objectives, steps, experiments, requirements, drafts; update dashboard frontmatter; push prompts to GitHub. Renders **Drafts table** (list of drafts with Generate AI Prompt and Push to GitHub per row) via `renderDraftsTable(container, projectPath, callbacks)`. | Via `window.ZettelkastenOperator` (e.g. `createResearchObjective`, `createResearchDraft`, `pushToGitHub`, `renderDraftsTable`) or from main when registering global actions. Each call instantiates `new ResearchManager(app, settings)`. |
| **service/projects/codeProjectManager.ts** | Code project lifecycle: create project/dashboard, requirements; refresh from GitHub (releases, unreleased commits); update dashboard frontmatter. | Via `window.ZettelkastenOperator` (e.g. `createCodeRequirement`, `refreshCodeProject`, `updateProjectDashboardProperties`) or from main. Each call instantiates `new CodeProjectManager(app, settings)`. |
| **service/compiler/draftCompiler.ts** | Compile a draft: resolve project config from dashboard, expand wiki links, write versioned file to `materials/`, update `config/paper_manifest.json`. | From main command `compile-current-draft` or via `window.ZettelkastenOperator.compileDraft(draftPath)`. |
| **service/compiler/promptGenerator.ts** | Generate AI prompt from draft: extract optional "AI prompt" section (moved to top), resolve links with configurable rules (folder/tag/regex → import_full, import_summary, citation_only, ignore), recursion with depth and cycle detection, token truncation, XML or Markdown wrapping, citation list (citationKey → Title). Saves to `project/prompts/`. | From main command `generate-ai-prompt`, via `window.ZettelkastenOperator.generateAIPrompt(draftFileOrPath)`, or from the Drafts table rendered by `renderDraftsTable`. |
| **service/github/githubClient.ts** | GitHub API: list releases, compare commits. Used only by `CodeProjectManager`. | `CodeProjectManager.refreshProject()` uses it; no direct use from UI. |

### 2.3 Dataview Layer

| File | Purpose | How to call |
|------|---------|-------------|
| **dataview/command.ts** | Registers a markdown code-block processor for `dataviewCodeBlockType` (e.g. `zettelkasten-query`). Parses first line as script ID, rest as params; delegates to manager. | Automatically when a note with a matching code block is rendered. |
| **dataview/manager.ts** | Ensures scripts folder exists, creates default scripts (quick-actions, gantt, tables, etc.), loads `.js` from vault, caches content, watches for file changes. Executes script via `app.plugins.plugins.dataview.api.executeJs()`. | Called by `DataviewCommand.processDvjsBlock()` with script ID, container element, and params. |
| **dataview/builder.ts** | Fluent API to build and register a script (id, name, description, parameters, content). | Used programmatically if adding scripts from code; default scripts are created directly in manager. |
| **dataview/types.ts** | Interfaces for script metadata and execution. | Used by manager and builder. |

### 2.4 UI Layer (Modals)

| File | Purpose | How to call |
|------|---------|-------------|
| **modals/dashboard.ts** | Main “Zettelkasten Control” modal: Quick Actions (Search, Research, Projects), Create New Note (by type), Active Context, Upgrade. | `factory.openCreationModal()` from main (ribbon/command) or from Search modal when creating a new note. |
| **modals/searchModal.ts** | Search notes in a folder, optional tag filter; Open / Insert wikilink; Enter = create/open or open Dashboard. | Command `open-zettelkasten-search` or Dashboard “Search” button. |
| **modals/template.ts** | Grid of templates for a note type (from settings). | Opened by Dashboard when user clicks a note-type card. |
| **modals/filename.ts** | Text input for note title; duplicate/similar file hints. | Opened by Dashboard after template selection. |
| **modals/researchProjectsModal.ts** | List research projects; create or open. | Dashboard “Research” button. |
| **modals/codeProjectsModal.ts** | List code projects; create or open. | Dashboard “Projects” button. |

---

## 3. Entry Points & Call Flow

- **Ribbon icon (plus-square)** → `factory.openCreationModal()` → Dashboard.
- **Command “Create New Zettel Note”** → same as ribbon.
- **Command “Open Zettelkasten Search”** → `new SearchModal(app, settings, factory).open()`.
- **Command “Compile current draft to materials”** → active file must be under `.../drafts/` → `DraftCompiler.resolveConfig` + `compileDraft` + `updateManifest`.
- **Command “Generate AI Prompt from current draft”** → active file under `.../drafts/` → `PromptGenerator.generatePrompt`.
- **Markdown code block** (e.g. ` ```zettelkasten-query `) → `DataviewCommand.processDvjsBlock` → `DataviewJSManager.executeScript` → Dataview’s `executeJs`; scripts then call `window.ZettelkastenOperator` as needed.
- **Research Quick Actions (Dashboard)** → script calls `ZettelkastenOperator.renderDraftsTable(container, projectPath)`; ResearchManager renders the drafts list (per-draft Generate AI Prompt and Push to GitHub buttons).
- **Dashboard Quick Actions** → Search / Research / Projects open the corresponding modal (and close Dashboard).

All project/draft/requirement creation from **within a note** (e.g. Research Dashboard) goes through `window.ZettelkastenOperator`, which resolves the project file by path and delegates to the right manager.

---

## 4. Communication & Data Flow

- **Plugin → Factory**: Main holds `this.factory` and passes `this.settings`; Factory gets settings at `initialize()` and uses them for paths and templates.
- **Plugin → Dataview**: Main creates one `DataviewCommand` when Dataview is enabled; settings changes that toggle or change scripts folder recreate it and call `dataview.initialize()` again.
- **Plugin → Global API**: `registerGlobalActions()` in main attaches `window.ZettelkastenOperator`. Each method receives `projectPath` (or similar), resolves `TFile` with `app.vault.getAbstractFileByPath`, then instantiates the right manager and calls it. No long-lived manager instances.
- **Dataview scripts → Plugin**: Scripts run in Dataview’s JS context; they use `dv.current().file.path` and call e.g. `ZettelkastenOperator.createResearchDraft(projectPath, title)`. Errors surface via `Notice` and logger.
- **Managers → Vault**: All create/update operations use `app.vault` and `app.fileManager.processFrontMatter` or raw read/modify. ResearchManager also uses `requestUrl` for GitHub push.
- **Settings**: Changed in Settings tab → `plugin.saveSettings()` (writes to Obsidian’s plugin data). Dataview toggle/path/code-block type trigger `refreshDataview()` in settings, which recreates `DataviewCommand`.

---

## 5. Debugging Guide for New Maintainers

### 5.1 Enable Logging

- The codebase uses `Logger` and `ContextLogger` from `src/logger.ts`.
- Set **debug mode** (e.g. in browser console after plugin load):
  ```js
  // In DevTools console (with plugin loaded):
  require('obsidian').require('path').require('fs'); // not needed for Logger
  // If you expose it: window.ZettelkastenOperator.setDebugMode(true)
  ```
  Or set `Logger.isDebugMode = true` in `logger.ts` temporarily; then `Logger.debug()` and `Logger.http()` will print.
- Loggers are created per module, e.g. `Logger.createLogger('NoteFactory')`. Search for `createLogger(` to see all contexts.
- **Where to look**: `Logger.info` / `error` / `warn` in factory, researchManager, codeProjectManager, draftCompiler, promptGenerator, dataview/manager. Errors often surface as `Notice` + `Logger.error` or `logError`.

### 5.2 Where to Set Breakpoints

| Symptom | Suggested breakpoints / files |
|--------|-------------------------------|
| Note not created | `factory.ts`: `createZettel`, and inside `LibFactory.createByType` (from markdown-note-orm). Check `option.specificFolder`, `title`, and template. |
| Wrong folder or frontmatter | `constants.ts` (default paths), `settings.ts` (path inputs), and the manager that creates the note (researchManager / codeProjectManager): `createNote` and the `extraProps` passed in. |
| Dashboard / Quick Actions not working | `main.ts`: `registerGlobalActions` (object shape). In a Research dashboard note: first line of the script in `dataview/manager.ts` for `zk-research-quick-actions` (e.g. check `dv.current().file.path`). |
| “Script not found” or wrong script | `dataview/command.ts`: `processDvjsBlock` (scriptId). `dataview/manager.ts`: `getScript(scriptId)`, `executeScript`, and `scriptCache`. Ensure script ID in the note matches the script `id` (and file name) in `dataview-scripts/`. |
| Dataview block does nothing or shows error | `dataview/manager.ts`: `executeScript` (check `dataviewApi` and `executeJs`). In DevTools, check for JS errors in the script (e.g. `dv.current()` null, or `ZettelkastenOperator` undefined). |
| Research project/draft/objective creation fails | `main.ts`: the `createResearchDraft` / `createResearchObjective` branch in `registerGlobalActions`. `researchManager.ts`: `createDraft`, `createObjective`, `ensureFolder`, and `createNote`. Check project path and that dashboard file exists. |
| Code project refresh fails | `codeProjectManager.ts`: `refreshProject` (token, repo, `listReleases`, `compareCommits`). `github/githubClient.ts`: `listReleases`, `compareCommits`. Check `repo` frontmatter and token/key. |
| Compile draft fails | `draftCompiler.ts`: `resolveConfig` (draft path must contain `/drafts/`), `compileDraft` (wiki link expansion), `updateManifest`. Check dashboard exists and `config/paper_manifest.json` if used. |
| Settings not persisting | `settings.ts`: any `onChange` that calls `plugin.saveSettings()`. `main.ts`: `loadSettings` / `saveSettings`. Check that you’re not replacing `plugin.settings` with a new object before save. |

### 5.3 Common Issues and Fixes

- **“Project not found”**: Caller passes a path that isn’t a dashboard file (e.g. folder path). Global API expects the **dashboard file path** (e.g. `Research/MyProject/Dashboard.md`). Check `dv.current().file.path` in the script and what’s passed to `createResearchDraft` etc.
- **“Script 'zk-...' not found”**: Script not loaded — either the script file is missing in `dataview-scripts/`, or the ID in the code block doesn’t match (first line of block = script ID). Reload the note or toggle Dataview off/on in settings to force script reload; check `manager.scripts` in debugger.
- **“Dataview plugin not found or not enabled”**: Dataview must be installed and enabled. Our plugin only registers a code-block processor; execution is done by Dataview’s API.
- **Duplicate or “already registered” processor**: Main creates `DataviewCommand` once when enabled; settings “refresh” unloads and recreates it. If you see “already registered”, avoid registering the same code-block type twice (e.g. guard with a flag; see `processorRegistered` in command.ts).
- **Gantt / Quick Actions not updating**: Dataview re-renders blocks when the note or linked files change. If content comes from other notes (e.g. objectives), editing those notes should trigger re-render. For script changes, save the script file in `dataview-scripts/`; file watchers reload it.

### 5.4 Running Tests

- Unit tests live under `src/__tests__/` (e.g. constants, logger, dataview builder/command/manager, factory, researchManager, codeProjectManager, githubClient).
- Run tests: `npm test` (or `npx jest`). Use tests to verify default script IDs, path resolution, and manager behavior after refactors.
- After changing default scripts in `dataview/manager.ts`, run the dataview manager tests so “default script list” expectations stay in sync.

### 5.5 Checklist for a New Bug

1. Reproduce in a minimal vault (one project, one dashboard).
2. Open DevTools (Console + Sources), reproduce, and note any red errors or our `[Zettelkasten]` logs.
3. Identify the entry point (command, ribbon, or code block) and set a breakpoint in the corresponding file (main, factory, command, or manager).
4. For “create” bugs, step into the manager’s `createNote` and the library’s `createByType`; confirm path and frontmatter.
5. For script bugs, confirm script ID, that the script is in `manager.scripts` and `scriptCache`, and that `ZettelkastenOperator` is defined when the script runs.

---

## 6. Diagram Index

**All diagrams with explanations are in [diagrams.md](diagrams.md).** That document includes:

- **Class Diagram**: Complete class structure and relationships
- **Sequence: Create Note**: Flow from ribbon click to vault creation
- **Sequence: Dataview Execution**: How code blocks trigger scripts and call back to plugin
- **Sequence: Research Create Draft**: Quick Action flow from dashboard to vault
- **Sequence: Code Project Refresh**: GitHub API integration and file sync
- **Sequence: Compile Draft**: Wiki link expansion and materials generation

Each diagram includes PlantUML source code (render with [PlantUML](https://plantuml.com/) CLI, VS Code extension, or online) and explanations of when to reference it for debugging.
