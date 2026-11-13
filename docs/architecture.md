# Zettelkasten Operator — Architecture & Maintenance Guide

This document describes the plugin's architecture, how components communicate, and how to debug issues when maintaining the project. For features and usage, see the [README](../README.md).

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
| **Plugin core** | `main.ts`, `settings.ts`, `types.ts`, `constants.ts`, `logger.ts` | Bootstrap, settings UI, global API (`window.ZettelkastenOperator`), commands |
| **Service layer** | `service/` | Note creation, research and code project management, draft compile, AI prompts, GitHub access |
| **Dataview layer** | `dataview/` | Code block processor, built-in and custom scripts, file watchers, execution through the Dataview API |
| **UI layer** | `modals/`, `styles/` | Dashboard, search, template picker, project modals, confirm dialog, script editor |

- **Single source of truth**: `ZettelkastenSettings` in `types.ts`; defaults in `constants.ts` (`DEFAULT_SETTINGS`).
- **Note creation**: new notes go through `markdown-note-orm` (`LibFactory.createByType`) in `NoteFactory`, `ResearchManager` and `CodeProjectManager`. `createByType` seeds per-type default frontmatter (e.g. `url: ""` for permanent notes) and keeps existing scalar values when a template is applied, so a value passed in `extraProps` for such a field is ignored unless it is set explicitly afterwards (`CodeProjectManager.createNote` does this with `note.properties.set`).
- **Generated notes**: `CodeProjectManager` writes `Unreleased Commits.md` directly with `vault.create` / `vault.modify` (frontmatter from `stringifyYaml`), not through the ORM, because the whole note is replaced on every refresh.
- **Dataview scripts** run in note context; they call `window.ZettelkastenOperator` to create items, refresh code projects, push or pull.
- **Dependency**: execution needs the Dataview plugin with JavaScript queries enabled; the plugin itself only registers the code block processor.

---

## 2. Component Reference

### 2.1 Plugin Core

| File | Purpose | Key exports / usage |
|------|---------|----------------------|
| **main.ts** | Plugin entry. Creates `NoteFactory`, optional `DataviewCommand`, registers commands and the ribbon icon, exposes `window.ZettelkastenOperator` in `registerGlobalActions()`. | `MyPlugin` (default export). Commands: `create-zettel-note`, `open-zettelkasten-search`, `compile-current-draft`, `generate-ai-prompt`. |
| **settings.ts** | Settings tab with four tabs: General, Projects, Dataview, Templates. Projects holds root paths, Gantt colors, AI prompt generation and GitHub pull rules. Redrawing the same tab keeps the scroll position. | `SampleSettingTab`. Toggling Dataview or changing its folder recreates `DataviewCommand`. |
| **types.ts** | Shared interfaces: `ZettelkastenSettings`, `INoteOption`, `NoteCategory`, `AIPromptRule`, `GithubPullRule`, `IGanttStatusColorMap`. | Used by main, settings, services, modals. |
| **constants.ts** | `DEFAULT_SETTINGS`, Gantt color options and defaults, prefix placeholders, `DEFAULT_AI_PROMPT_RULES`, `DEFAULT_NOTE_CATEGORIES` (with upgrade paths). | Imported by main, settings, factory, dashboard. |
| **logger.ts** | Central logging with context loggers; console output is prefixed `[Zettelkasten]` / `[Zettelkasten:<Context>]`. | `Logger.createLogger(context)`, `Logger.setDebugMode(true)`, `Logger.getErrorMessage(err)`. |

### 2.2 Service Layer

| File | Purpose | How to call |
|------|---------|-------------|
| **service/factory.ts** | Creates Zettel notes by type with an optional template and extra frontmatter. `createNoteFromOption(option, title)` resolves the title prefix, checks `vault.adapter.exists` (catches case-only collisions) and asks `confirmOverwrite(path)` before overwriting; it returns `null` on cancel. | `factory.openCreationModal()` (ribbon/command) → Dashboard → `createNoteFromOption`. `createZettel()` creates without the check. `confirmOverwrite` is a replaceable property (default: `confirmAction` modal). |
| **service/projects/researchManager.ts** | Research project lifecycle: project and dashboard, objectives, steps, experiments, requirements, drafts; dashboard frontmatter; **push** of `prompts/` as one GraphQL commit; **pull** of repo files by rules (`setPullRules`, `pullFromGitHub`); renders the drafts table. | Via `window.ZettelkastenOperator` (`createResearch*`, `pushToGitHub`, `setResearchPullRules`, `pullFromGitHub`, `renderDraftsTable`). Each call creates `new ResearchManager(app, settings)`. |
| **service/projects/codeProjectManager.ts** | Code project lifecycle: project and dashboard, requirements; `refreshProject(file, tokenKey?, { confirmLegacyCleanup? })` syncs releases, rewrites `Unreleased Commits.md` (`buildUnreleasedCommitsNote`), offers to trash legacy `commits/*.md`, and throws readable errors. | Via `window.ZettelkastenOperator` (`createCodeRequirement`, `refreshCodeProject`, `updateProjectDashboardProperties`) and `CodeProjectsModal`. Both pass a `confirmLegacyCleanup` built on `askLegacyCommitCleanup`. |
| **service/compiler/draftCompiler.ts** | Compiles a draft: resolves project config from the dashboard, expands wiki links, writes a versioned file to `materials/`, updates `config/paper_manifest.json`. | Command `compile-current-draft` or `ZettelkastenOperator.compileDraft(draftPath)`. |
| **service/compiler/promptGenerator.ts** | Generates an AI prompt from a draft: system prompt first, then the draft's `## AI prompt` section, then linked notes resolved with the rules (folder/tag/regex → import_full, import_summary, citation_only, ignore), recursion depth, cycle detection, truncation, XML or Markdown wrapping, citation list. Saves `prompts/<draft>_prompt_v<date>.md`. | Command `generate-ai-prompt`, `ZettelkastenOperator.generateAIPrompt(draftFileOrPath)`, or the drafts table. |
| **service/github/githubClient.ts** | GitHub access over Obsidian's `requestUrl`: `listReleases`, `compareCommits`, `graphql` (POST to `/graphql`, a 200 with `errors` throws), `listDirectory` and `downloadRaw` (contents API, path segments and ref encoded, raw media type for bytes). | Used by `CodeProjectManager` (releases, compare) and `ResearchManager` (push, pull). |
| **service/github/errors.ts** | `githubErrorStatus(err)` and `describeGitHubError(err, action, authed, notFound)` → "`<action>` failed (`<status>`): `<hint>`" with hints for 401, 403 (with or without PAT), and 404 for a repo, a tag/branch, or a folder/file. | Shared by refresh, push and pull. |
| **service/github/gitHash.ts** | `gitBlobSha(bytes)` (git blob id, SHA-1 of `blob <len>\0` + bytes via `crypto.subtle`) and `bytesToBase64(bytes)` (chunked). | Push skips prompts whose blob id matches the remote; pull skips files whose blob id matches the listing's `sha`. |
| **service/github/repoPull.ts** | Pure helpers for pull rules: `generateRuleId`, `validatePullRule`, `selectPullFiles` (plain files with a `download_url`, name matches the regex), `resolvePullTarget` (rejects `..` with either separator, paths outside the project, and names Obsidian rejects). | Used by settings (ids, validation) and `ResearchManager.pullFromGitHub`. |

### 2.3 Dataview Layer

| File | Purpose | How to call |
|------|---------|-------------|
| **dataview/command.ts** | Registers the code block processor for `dataviewCodeBlockType` (e.g. `zettelkasten-query`). `scheduleProcessDvjsBlock` creates a `MarkdownRenderChild` for the block (added to the context synchronously), then renders: elements not yet in the document render after `setTimeout(0)` and two animation frames; elements already in the document are debounced 350 ms per block, one pending render per element, and elements removed in the meantime are skipped. `runDvjsBlock` takes the script ID from the first line and parameters from the rest (split at the first `:` or `=`, JSON values parsed). | Automatically when a note with a matching block renders. It also wires the manager's options to plugin settings (`dataviewReloadDefaultsOnLoad`, `dataviewDefaultScriptHashes`, `saveSettings`, Notices). |
| **dataview/manager.ts** | Creates the scripts folder, writes the 16 built-in scripts, loads `.js` files (metadata from a multi-line `/** @id … */` header, else the file name), caches content, watches create/modify/rename/delete. Built-in scripts are written according to a per-script hash state `{ written, seen }` (see 4). `executeScript(id, container, params, ctx, component)` runs the script with `dataviewApi.executeJs`, attaching Dataview's renderer to the block's own component. | Called by `DataviewCommand`. `getDefaultScriptContent(id)` and `hashContent()` are exported (settings Reset, tests). |
| **dataview/builder.ts** | Fluent API to build and register a script. | Programmatic use; built-in scripts are defined directly in the manager. |
| **dataview/types.ts** | Interfaces for script metadata and execution. | Used by manager and builder. |

### 2.4 UI Layer (Modals)

| File | Purpose | How to call |
|------|---------|-------------|
| **modals/dashboard.ts** | "Zettelkasten Control" modal: Quick Actions (Search, Research, Projects), Create New Note, Active Context (with Move), Upgrade. Upgrade shows a notice instead of failing for note types outside the four core types. | `factory.openCreationModal()` from the ribbon/command, or from the Search modal. |
| **modals/confirmModal.ts** | `ConfirmModal` and `confirmAction(app, { title, message, confirmText?, cancelText? })` → `Promise<boolean>`; closing without a button counts as Cancel. | Note overwrite (factory) and legacy commit cleanup (`askLegacyCommitCleanup`). |
| **modals/searchModal.ts** | Search notes in a folder with an optional tag filter; Open / Insert wikilink; double-click adds the current note to the result's `sources`. | Command `open-zettelkasten-search` or the Dashboard's Search button. |
| **modals/template.ts** | Grid of templates for a note type. | Opened by the Dashboard when a note-type card is clicked. |
| **modals/filename.ts** | Title input with hints about similar existing files. | Opened after a template is picked. |
| **modals/researchProjectsModal.ts** | List, create, import and open research projects. | Dashboard's Research button. |
| **modals/codeProjectsModal.ts** | List, create, import, open and refresh code projects; exports `askLegacyCommitCleanup(app, count)`. | Dashboard's Projects button; `main.ts` uses `askLegacyCommitCleanup` for the global API. |
| **modals/dataviewScriptEditorModal.ts** | Editor for a Dataview script's ID, name and content. | Settings → Dataview → Scripts. |

---

## 3. Entry Points & Call Flow

- **Ribbon icon (plus-square)** and command **Create New Zettel Note** → `factory.openCreationModal()` → Dashboard → template → title → `createNoteFromOption`.
- **Command Open Zettelkasten Search** → `new SearchModal(app, settings, factory).open()`.
- **Command Compile current draft to materials** → active file under `.../drafts/` → `DraftCompiler.resolveConfig` + `compileDraft` + `updateManifest`.
- **Command Generate AI Prompt from current draft** → active file under `.../drafts/` → `PromptGenerator.generatePrompt`.
- **Markdown code block** (` ```zettelkasten-query `) → `DataviewCommand.scheduleProcessDvjsBlock` → `runDvjsBlock` → `DataviewJSManager.executeScript` → Dataview `executeJs`; scripts then call `window.ZettelkastenOperator`.
- **Research Quick Actions** (`zk-research-quick-actions`) → create buttons, GitHub settings (via `updateResearchDashboardProperties`), the Pull group (`getPullRules`, `setResearchPullRules`, `pullFromGitHub`), and `renderDraftsTable` for per-draft Generate AI Prompt / Push to GitHub.
- **Code Quick Actions** (`zk-project-quick-actions`) → `createCodeRequirement`, `updateProjectDashboardProperties`, `refreshCodeProject`.
- **Dashboard Quick Actions** → Search / Research / Projects modals.

All creation, refresh, push and pull from within a note goes through `window.ZettelkastenOperator`, which resolves the dashboard file by path and delegates to the right manager.

---

## 4. Communication & Data Flow

- **Plugin → Factory**: main holds `this.factory` and passes `this.settings` at `initialize()`.
- **Plugin → Dataview**: main creates one `DataviewCommand` when Dataview is enabled; settings changes that toggle it or change the scripts folder recreate it and call `initialize()` again.
- **Plugin → Global API**: `registerGlobalActions()` attaches `window.ZettelkastenOperator`. Each method resolves the `TFile` with `app.vault.getAbstractFileByPath`, creates the manager and calls it. No long-lived manager instances.
- **Dataview scripts → Plugin**: scripts use `dv.current().file.path` as `projectPath`. Research create methods and push/pull report through Notices; `refreshCodeProject` throws Errors with readable messages, which the built-in script shows as "Refresh failed: …".
- **Built-in script state**: on load, for each built-in script the manager compares the file with the new default. Missing → create. Identical → no write. Hash equals the recorded `written` (or no record yet, which means an older version force-wrote it) → update to the new default. Otherwise the user edited it → keep it and report a new default once (tracked by `seen`). With "Reload default scripts on load" off, existing files and the state are left alone. The state is saved once per load in `settings.dataviewDefaultScriptHashes`.
- **Code project refresh**: `listReleases` → one note per release in `releases/` → `compareCommits(latestTag, defaultBranch)` → rewrite `Unreleased Commits.md` (empty list when there is no release or the compare fails, then the compare error is thrown) → optional legacy cleanup via the callback (`fileManager.trashFile`, falling back to `vault.trash(file, true)`; a decline writes `legacy_commits: keep`).
- **Research push**: read `prompts/*.md` bytes → one GraphQL query for the branch head and the target folder's entries → `createCommitOnBranch` with only changed files and `expectedHeadOid` → on "Expected branch to point to …" query again and retry once. `lastRequestDebug` (token masked) is stored on the plugin for the debug panel.
- **Research pull**: Dashboard `github_pull` ids → rules from settings → per rule `listDirectory(sourceDir)` → `selectPullFiles` → per file `resolvePullTarget`, compare `gitBlobSha(local)` with the listing `sha`, `downloadRaw` → `modifyBinary` or (after creating missing folders one segment at a time) `createBinary`. Each rule and file is isolated; problems become `failed` plus a warning.
- **Settings**: changed in the Settings tab → `plugin.saveSettings()`. Dataview toggle, folder or code block type trigger `refreshDataview()`, which recreates `DataviewCommand`.

---

## 5. Debugging Guide for New Maintainers

### 5.1 Enable Logging

- Logging goes through `Logger` in `src/logger.ts`; each module has a context logger (`Logger.createLogger('NoteFactory')` etc.). Search for `createLogger(` to see all contexts.
- `Logger.debug()` and `Logger.http()` print only in debug mode. Call `Logger.setDebugMode(true)` (temporarily in code, e.g. in `onload`) while investigating.
- Errors surface as a `Notice` plus `logger.error` / `logError`, prefixed `[Zettelkasten]` in the console.

### 5.2 Where to Set Breakpoints

| Symptom | Suggested breakpoints / files |
|--------|-------------------------------|
| Note not created or overwrite dialog unexpected | `factory.ts`: `createNoteFromOption` (prefix, `adapter.exists`, `confirmOverwrite`), then `createZettel` and `LibFactory.createByType`. |
| Wrong folder or frontmatter | `constants.ts` (default paths), `settings.ts` (path inputs), and the manager's `createNote` with its `extraProps`. Remember that ORM defaults win over template values unless set explicitly. |
| Dashboard / Quick Actions not working | `main.ts`: `registerGlobalActions`. The script text in `dataview/manager.ts` (e.g. `zk-research-quick-actions`); check `dv.current().file.path`. |
| "Script not found" or wrong script | `dataview/command.ts`: `runDvjsBlock` (script ID). `dataview/manager.ts`: `getScript`, `loadScript` (header parsing), `executeScript`. |
| Block renders twice, never, or in only one pane | `dataview/command.ts`: `scheduleProcessDvjsBlock` (first-paint path vs. per-block debounce, `isConnected`). |
| Built-in script not updated or user edit overwritten | `dataview/manager.ts`: `createDefaultScripts` and the saved `dataviewDefaultScriptHashes`. |
| Code project refresh fails | `codeProjectManager.ts`: `refreshProject` (repo, token, `listReleases`, `compareCommits`, note write, legacy cleanup); `github/errors.ts` for the message. |
| Push fails or commits too much | `researchManager.ts`: `pushToGitHub`, `readPromptsOnBranch`; `gitHash.ts`. Turn on "Show debug panels" to see the last request in Quick Actions. |
| Pull skips, fails or writes in the wrong place | `researchManager.ts`: `pullFromGitHub`, `pullOneFile`; `repoPull.ts`: `selectPullFiles`, `resolvePullTarget`, `validatePullRule`. |
| Compile draft fails | `draftCompiler.ts`: `resolveConfig` (path must contain `/drafts/`), `compileDraft`, `updateManifest`. |
| Settings not persisting | `settings.ts`: `onChange` handlers calling `plugin.saveSettings()`; `main.ts`: `loadSettings` / `saveSettings`. |

### 5.3 Common Issues and Fixes

- **Plugin fails to load with `ENOENT ... main.js`**: the plugin folder is a source checkout without a build. Run `npm ci && npm run build` there, or copy `main.js` and `styles.css` from a release or build.
- **"Dataview plugin not found or not enabled"**: `app.plugins.plugins.dataview.api` is missing. Install and enable Dataview, turn on its JavaScript queries, and check in the console: `app.plugins.manifests.dataview` (installed), `app.plugins.enabledPlugins.has("dataview")` (enabled), `!!app.plugins.plugins.dataview?.api` (loaded).
- **"Project not found"**: the caller passed something other than the dashboard file path (e.g. a folder). The global API expects e.g. `Research/MyProject/Dashboard.md`.
- **"Script 'zk-...' not found"**: the script file is missing in the scripts folder or the block's first line does not match its ID. Custom scripts need a multi-line `/** @id … */` header or a matching file name.
- **"No PAT found for key …"**: the selected `github_token_key` has no secret in SecretStorage. Store the token, pick another key, or tick Public for a public repo.
- **"Objective not found: …"** in an objective's steps table: the block's `objectivePath` no longer resolves, usually after a rename. Update or remove the parameter.
- **Duplicate or "already registered" processor**: `DataviewCommand` registers once (`processorRegistered`); avoid registering the same code block type twice.
- **Tables not updating**: Dataview re-renders when its index changes; renderers belong to the block's `MarkdownRenderChild` and unload with it. Script file changes are picked up by the manager's file watchers.

### 5.4 Running Tests

- Tests live under `src/__tests__/`, with Obsidian and markdown-note-orm mocks in `src/__mocks__/` (`testHelpers.ts` has a fake GitHub GraphQL server, contents API routes and a fake Dataview harness). `src/__tests__/verify/` holds independent acceptance checks.
- Run `npm test`; `npx jest --coverage` enforces the thresholds in `jest.config.ts`. Type check with `npx tsc -noEmit -skipLibCheck`; build with `npm run build`.
- The ORM mock can mimic the real library's merge rule with `setOrmMergeMode("preserve-existing")`.
- Built-in script text can be run in tests with `getDefaultScriptContent(id)` and `runDataviewScript` from the helpers.

### 5.5 Checklist for a New Bug

1. Reproduce in a minimal vault (one project, one dashboard) with Dataview enabled.
2. Open DevTools (Console + Sources), reproduce, and note red errors or `[Zettelkasten]` logs.
3. Identify the entry point (command, ribbon, code block or global API method) and set a breakpoint in the corresponding file.
4. For "create" bugs, step into the manager's `createNote` and the library's `createByType`; confirm path and frontmatter.
5. For script bugs, confirm the script ID, that it is in the manager's `scripts` and `scriptCache`, and that `ZettelkastenOperator` is defined when the script runs.
6. For GitHub bugs, read the Notice text (it names the action and status) and, for push, the debug panel.

---

## 6. Diagram Index

All diagrams are PlantUML files in [diagrams/](diagrams/); [diagrams.md](diagrams.md) lists them with their purpose and what to look at when debugging:

- **Class Diagram**: classes and relationships across the four layers
- **Sequence: Create Note**: ribbon click to vault write, including the overwrite confirmation
- **Sequence: Dataview Execution**: code block rendering, debounce and script execution
- **Sequence: Research Create Draft**: Quick Action flow from dashboard to vault
- **Sequence: Research Push**: prompts to one GitHub commit
- **Sequence: Research Pull**: pull rules to files in the project folder
- **Sequence: Code Project Refresh**: releases, the Unreleased Commits note and legacy cleanup
- **Sequence: Compile Draft**: wiki link expansion and materials generation
