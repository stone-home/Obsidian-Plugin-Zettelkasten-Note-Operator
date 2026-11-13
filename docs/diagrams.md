# Architecture Diagrams

The PlantUML sources in [diagrams/](diagrams/) are the only copy of each diagram; this page lists them with their purpose and what to look at when debugging. For the components themselves see [architecture.md](architecture.md).

**How to view the diagrams:**

1. **VS Code**: install the "PlantUML" extension and open a `.puml` file in `docs/diagrams/`.
2. **CLI**: install PlantUML and run `plantuml docs/diagrams/*.puml` to generate images.
3. **Online**: paste a file's content into [plantuml.com/plantuml](https://plantuml.com/plantuml).

---

## 1. Class Diagram

File: [diagrams/class.puml](diagrams/class.puml)

Classes and helper modules in the four layers (Plugin Core, Service Layer, Dataview Layer, UI Layer) and how they relate.

- `MyPlugin` holds `NoteFactory` and an optional `DataviewCommand`; managers (`ResearchManager`, `CodeProjectManager`, `DraftCompiler`, `PromptGenerator`) are created on demand by the global API.
- `GitHubClient` is shared: code projects use releases and compare, research projects use GraphQL (push) and the contents API (pull). `github/errors`, `github/gitHash` and `github/repoPull` are function modules.
- `ConfirmModal` backs both the note overwrite confirmation and the legacy commit cleanup.

## 2. Sequence: Create New Note

File: [diagrams/sequence-create-note.puml](diagrams/sequence-create-note.puml)

From the ribbon or command through Dashboard, template and title to the vault write. Shows prefix resolution, the `adapter.exists` check and the overwrite confirmation (cancel returns `null` and writes nothing), and how Upgrade adds `sources`.

Use it when a note lands in the wrong folder, gets the wrong name, or the overwrite dialog behaves unexpectedly.

## 3. Sequence: Dataview Code Block Execution

File: [diagrams/sequence-dataview-execute.puml](diagrams/sequence-dataview-execute.puml)

From rendering a `zettelkasten-query` block to the script calling `window.ZettelkastenOperator`. Shows the block's `MarkdownRenderChild`, the first-paint path versus the 350 ms per-block debounce with one pending render per element, parameter parsing, and `executeJs` attaching Dataview's renderer to the block's component.

Use it when a block does not render, renders in only one pane, or shows "Script not found" / "Dataview plugin not found or not enabled".

## 4. Sequence: Research Quick Action — Create Draft

File: [diagrams/sequence-research-create.puml](diagrams/sequence-research-create.puml)

From the Create button in the research dashboard to the draft note in `drafts/`, including project resolution, the project prefix in the file name and the duplicate check.

Use it when creating objectives, steps, experiments or drafts fails; they follow the same path.

## 5. Sequence: Research Push

File: [diagrams/sequence-research-push.puml](diagrams/sequence-research-push.puml)

From Push to GitHub to a single `createCommitOnBranch` commit: preconditions, the query for the branch head and target folder, skipping prompts with the same git blob id, the one retry when the branch moved, and the debug info stored for Quick Actions.

Use it when a push makes no commit, fails, or uploads unchanged files.

## 6. Sequence: Research Pull

File: [diagrams/sequence-research-pull.puml](diagrams/sequence-research-pull.puml)

Defining pull rules in the settings, picking them per project in Quick Actions (`github_pull`), and the pull itself: rule validation, folder listing, file selection, target path checks, skip by blob id, download, and writing with folders created one segment at a time. Each rule and file is isolated.

Use it when files are skipped, counted as failed, or land in an unexpected folder.

## 7. Sequence: Code Project Refresh

File: [diagrams/sequence-code-refresh.puml](diagrams/sequence-code-refresh.puml)

From Refresh to release notes and the rewritten `Unreleased Commits.md`: repo and PAT checks, error messages, release notes with their URL on first creation, the compare, the empty note when there is no release or the compare fails, and the one-time legacy cleanup of `commits/*.md`.

Use it when Refresh fails, URLs are missing, or the unreleased commits look stale.

## 8. Sequence: Compile Current Draft to Materials

File: [diagrams/sequence-compile-draft.puml](diagrams/sequence-compile-draft.puml)

From the command to a versioned file in `materials/` and the manifest update: config resolution from the dashboard and wiki link expansion.

Use it when compiling fails or links are not expanded.
