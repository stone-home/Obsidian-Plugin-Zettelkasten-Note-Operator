# Zettelkasten Operator

An Obsidian plugin for managing Zettelkasten notes with integrated project management for research papers and code projects.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Zettelkasten Notes](#zettelkasten-notes)
- [Research Project Management](#research-project-management)
- [Code Project Management](#code-project-management)
- [Dataview Integration](#dataview-integration)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Architecture](#architecture)
- [License](#license)

## Features

- **Zettelkasten note types**: create Fleeting, Literature, Atom and Permanent notes from templates, and derive a new note from the current one (Upgrade). Creating a note over an existing file asks first.
- **Research projects**: objectives, steps, experiments, requirements and drafts under one dashboard, with a PlantUML Gantt chart, target conferences and draft tracking.
- **AI prompts**: build a prompt from a draft by following its links with configurable rules, then push the prompts to GitHub in a single commit.
- **Pull from GitHub**: download experiment notes, results or figures from the project's repo into the project folder, using rules defined once in the settings.
- **Code projects**: sync GitHub releases, keep the commits after the latest release in one note, and link requirements to releases.
- **Dataview scripts**: reusable DataviewJS scripts loaded by ID from a code block, with 16 built-in scripts that power the dashboards.
- **Templates**: configurable note templates with folders, title prefixes, frontmatter and body sections.

## Installation

1. Install and enable the [Dataview](https://github.com/blacksmithgu/obsidian-dataview) plugin, and turn on **Enable JavaScript Queries** in its settings. The dashboards and every `zettelkasten-query` block run through Dataview; without it a block shows "Dataview plugin not found or not enabled".
2. Download `main.js`, `manifest.json` and `styles.css` from the latest GitHub release into `.obsidian/plugins/<folder>/` in your vault.
3. Enable the plugin in Settings → Community plugins.

To run from a clone of this repo instead, run `npm ci` and `npm run build` in the clone; the build writes `main.js` and `styles.css` next to `manifest.json`. A clone without a build has no `main.js`, and Obsidian then fails to load the plugin with `ENOENT ... main.js`.

## Usage

Common workflows:

- **Create a new note**: click the **+** ribbon icon or run *Create New Zettel Note* → choose a note type → pick a template → enter a title. The note is created in the folder set for that type (e.g. `004-Permanent/`). If a note with that name already exists, you are asked before it is overwritten.
- **Search and link**: run *Open Zettelkasten Search* (or click Search in the dashboard). Set the target folder, type to filter, then **Open** a result or **Insert** a `[[path|name]]` wikilink at the cursor. Double-click a result to add the current note to that note's `sources` frontmatter.
- **Research project**: from the dashboard click **Research** → create or open a project. In the project's `Dashboard.md`, use Quick Actions to create objectives, steps, experiments and drafts. The **Drafts** list has a **Generate AI Prompt** and a **Push to GitHub** button per draft; the command *Generate AI Prompt from current draft* does the same for the active draft. See [Pulling files from GitHub](#pulling-files-from-github) to bring results back from the repo.
- **Code project**: from the dashboard click **Projects** → create or open a project. In `Dashboard.md` set `repo` (e.g. `owner/repo`), pick a PAT for a private repo or tick **Public**, then click **Refresh** to sync releases and unreleased commits. Create requirements and link them to releases in the Requirements table.
- **Call the plugin from a script**: in a DataviewJS block use `window.ZettelkastenOperator`, e.g. `await ZettelkastenOperator.createResearchDraft(dv.current().file.path, "My Draft")`. See [API Reference](#api-reference).

## Zettelkasten Notes

The plugin supports four core Zettelkasten note types:

| Type | Purpose | Default Path |
|------|---------|--------------|
| **Fleeting** | Quick capture of ideas | `001-Fleeting/` |
| **Literature** | Notes from sources | `002-Literature/` |
| **Atom** | Single concept notes | `003-Atom/` |
| **Permanent** | Refined, permanent notes | `004-Permanent/` |

Lexicon (`005-Lexicon/`) and Hub (`006-Hubs/`) folders are also configurable; the AI prompt rules and the research tables read from them.

### Creating Notes

1. Click the **+** ribbon icon or run *Create New Zettel Note*.
2. Select the note type.
3. Choose a template (Settings → Templates).
4. Enter the note title. The template's prefix (e.g. `$date`) is added in front of it.

If the resulting file already exists, a dialog asks whether to overwrite it; Cancel (or Esc) leaves the existing note untouched.

### Upgrade

With a note open, the dashboard's **Upgrade** section creates a new note derived from it, and writes a link back to the current note into the new note's `sources`. The types offered depend on the current note's type (for example a Fleeting note offers Atom and Permanent). For a type outside the four core types (such as `run` or `objective`), the section says the type is not in the upgrade range.

### Note Type Hierarchy

All project-related notes use `type: permanent` as the base type, with the subtype stored in tags:

```yaml
---
type: permanent
tags:
  - type/research-objective
title: My Objective
status: active
---
```

## Research Project Management

Research projects manage academic papers with a structured hierarchy.

### Project Structure

```plain-text
Research/
└── MyProject/
    ├── Dashboard.md          # Research Command Center
    ├── objectives/           # High-level goals
    ├── steps/                # Tasks linked to objectives
    ├── experiments/          # Research experiments
    ├── requirements/         # Project requirements
    ├── drafts/               # Paper drafts
    ├── materials/            # Compiled drafts (command "Compile current draft to materials")
    └── prompts/              # Generated AI prompts (pushed to GitHub)
```

Objectives, steps, experiments and drafts get a project prefix in their file name: the project code (Dashboard `project_code`, or initials derived from the folder name) plus the project's creation date, e.g. `MR2620260213 - Baseline`.

### Dashboard

A new research dashboard contains these sections, each a `zettelkasten-query` block:

| Section | Script | Shows |
|---------|--------|-------|
| Quick Actions | `zk-research-quick-actions` | Create objectives, steps, experiments and drafts; repo, branch, target folder, PAT and Public settings; the Pull group; the drafts list |
| Data Pipeline Visualization | `zk-research-target-conference` | The takeaway workflow diagram and the target conferences from `conferences` |
| AI Pipeline Tracking | `zk-research-ai-pipeline-tracking` | Drafts with their status, prompt copies and latest prompt |
| Atomic Intelligence | `zk-research-ai-pipeline`, `zk-research-atomic-notes` | Literature, Atom, Permanent and Lexicon notes whose `projects` contains this project's `project_id` |
| Production Staging | `zk-research-materials` | Files in `materials/` |
| Objectives Timeline | `zk-research-gantt` | PlantUML Gantt chart |
| Objectives / Steps / Experiments | `zk-research-objectives`, `zk-research-steps`, `zk-research-experiments` | Tables of those notes |

Dashboard frontmatter used by the plugin:

| Field | Meaning | Default |
|-------|---------|---------|
| `project_id`, `project_name` | Identity; notes link to the project through `project_id` in their `projects` list | from the project name |
| `project_code` | Prefix code for child note names; empty means initials of the folder name | empty |
| `repo`, `defaultBranch` | GitHub repo (`owner/name`) and branch for push and pull | empty, `main` |
| `github_token_key`, `public_repo` | Selected PAT (SecretStorage key) and whether the repo is public | empty, `true` |
| `github_target_folder` | Repo folder that prompts are pushed to | `prompts` |
| `github_pull` | Ids of the pull rules this project uses | `[]` |
| `conferences` | Links to CFP notes for the target conference table | `[]` |
| `granularity` | Gantt scale: `day`, `week` or `month` | `day` |

### Gantt Chart

The chart shows drafts, experiments and objectives. Drafts and experiments start at `start` (or `due`, or the file's modification date) and end at `end` (or `due`, or the modification date); an end that was not set explicitly and falls before the start is drawn as a one-day task. Objectives need both `start` and `end`. Items whose dates are invalid (e.g. `tbd`, `2026-02-30`) or whose explicit `end` is before `start` are left out of the chart and listed under it in a **Not drawn** table with the note, field, value and reason.

Configure status colors in Settings → Projects → Gantt Chart Status Colors:

| Status | Color | Description |
|--------|-------|-------------|
| `completed` / `done` | Green | Finished tasks |
| `active` / `in-progress` | Orange | Current work |
| `planned` / `todo` | Gray | Not started |
| `proposed` | Blue | Proposed |
| `blocked` | Red | Blocked tasks |
| `cancelled` | Dark Gray | Cancelled tasks |

### AI Prompts and Push to GitHub

**Generate AI Prompt** builds a prompt from a draft and saves it as `prompts/<draft>_prompt_v<date>.md`. It follows the draft's links with the rules in Settings → Projects → AI Prompt Generation (see [Configuration](#configuration)). A section titled `## AI prompt` in the draft is moved to the top, after the optional system prompt.

**Push to GitHub** uploads the `.md` files in `prompts/` to `<github_target_folder>/` on the dashboard's repo and branch. It needs a PAT. All changed prompts go into one commit; prompts that are already identical on GitHub are skipped, and if nothing changed no commit is made. If the branch moves while pushing, the plugin reads it again and retries once. A missing branch or a GitHub error is reported in a notice.

### Pulling files from GitHub

Pull experiment notes, results or figures from the project's repo (the dashboard's `repo`, `defaultBranch` and PAT) into the project folder.

1. In **Settings → Projects → GitHub pull rules**, click **Add pull rule** and fill in:
   - **Repo folder**: a folder in the repo, e.g. `pkm`. Only files directly inside it are pulled (no subfolders).
   - **File name pattern**: a regular expression tested against the file name, e.g. `\.md$` or `\.(png|pdf|csv)$`.
   - **Target folder**: a relative path that starts from the research project folder, e.g. `runs` puts files in `<project>/runs` and `results/figures` in `<project>/results/figures`. A leading `/` or `..` is rejected. Missing folders are created.
   Each rule gets a random id, shown in the settings.
2. In the project dashboard's **Quick Actions**, pick a rule in the **Pull** dropdown and click **Add**. The ids are stored in the dashboard's `github_pull` list; **Remove** takes a rule out again.
3. Click **Pull from GitHub**.

A public repo can be pulled without a PAT: tick **Public** in Quick Actions. Without a PAT, GitHub allows 60 requests per hour, and each listed folder and each downloaded file is one request.

The repo wins: a file that changed in the repo overwrites the local copy, so edits made in the vault to pulled files are lost on the next pull. Files that are unchanged (same git blob id) are skipped, and local files are never deleted. A problem with one rule or file is reported and the rest still runs. A notice reports how many files were added, updated, skipped or failed. GitHub lists at most 1000 entries per folder.

## Code Project Management

Manage code projects with GitHub integration for tracking releases and commits.

### Project Structure

```plain-text
Projects/
└── MyCodeProject/
    ├── Dashboard.md            # Project overview
    ├── Unreleased Commits.md   # Commits after the latest release, rewritten on every Refresh
    ├── releases/               # One note per GitHub release
    │   ├── v1.0.0.md
    │   └── v1.1.0.md
    └── requirements/           # Feature requirements
        └── Feature1.md
```

### Dashboard

- **Quick Actions** (`zk-project-quick-actions`): create requirements, pick a PAT or tick **Public**, and **Refresh**.
- **Requirements** (`zk-project-requirements`): requirements with status and priority; a dropdown per row links a requirement to a release.
- **Releases** (`zk-project-releases`): all synced releases.
- **Unreleased Commits** (`zk-project-commits`): the commits stored in `Unreleased Commits.md`.

Dashboard frontmatter: `repo` (`owner/name`), `defaultBranch` (default `trunk`), `github_token_key`, `public_repo`, and `legacy_commits` (see below).

### Refresh

**Refresh** lists the repo's releases and writes one note per release in `releases/` (version, date, URL and release notes). It then compares the latest release with the default branch and rewrites `Unreleased Commits.md` as a whole: the commits as frontmatter (short sha, first message line, date, URL) plus a readable table. When there is no release yet, or the comparison fails, the note is rewritten with an empty list (and the reason). A notice summarises the result.

Problems are reported with what to fix: a missing `repo`, a selected PAT key with no stored secret, a rejected PAT (401), missing access or the hourly limit for requests without a PAT (403), a missing or hidden repo, or a missing tag or branch (404).

Older versions saved each unreleased commit as `commits/<sha>.md`. On the first Refresh after updating, the plugin offers to move those notes to the trash. If you decline, `legacy_commits: keep` is written to the dashboard and you are not asked again.

### GitHub Token Setup

1. Create a Personal Access Token at GitHub → Settings → Developer settings. Pushing prompts needs write access to the repo's contents.
2. Store the token in Obsidian's SecretStorage, for example with another plugin or from the developer console.
3. Pick it in the project's Quick Actions. The PAT dropdowns list every secret stored in SecretStorage; the chosen key is saved as `github_token_key` in the dashboard.

## Dataview Integration

The plugin registers a code block processor that runs reusable DataviewJS scripts. It requires the Dataview plugin with JavaScript queries enabled.

### Script Storage

Scripts are `.js` files in the scripts folder (default `dataview-scripts/`). The built-in scripts are written there on load:

```plain-text
dataview-scripts/
├── zk-research-quick-actions.js
├── zk-research-gantt.js
├── zk-project-quick-actions.js
└── custom-script.js
```

They can be edited in Settings → Dataview → Scripts or as files; changes are picked up without restarting.

### Using Scripts

Load a script by ID in a code block:

````plain-text
```zettelkasten-query
script-id
param1: value1
param2 = value2
```
````

Each parameter line is split at its first `:` or `=`; the rest of the line is the value, parsed as JSON when possible (e.g. `["a", "b"]`, `3`). The script reads them from `input`.

### Built-in Scripts

| Script ID | Purpose |
|-----------|---------|
| `zk-research-quick-actions` | Research dashboard quick actions, Pull group and drafts list |
| `zk-research-ai-pipeline-tracking` | Drafts with status, section, prompt copies and latest prompt |
| `zk-research-ai-pipeline` | Literature notes linked to the project |
| `zk-research-atomic-notes` | Atom, Permanent and Lexicon notes linked to the project |
| `zk-research-materials` | Files in `materials/` |
| `zk-research-gantt` | PlantUML Gantt chart, with the Not drawn table |
| `zk-research-objectives` | Objectives with status, start and end |
| `zk-research-steps` | Steps with their objective and status |
| `zk-research-objective-steps` | Steps of one objective (used inside objective notes) |
| `zk-research-experiments` | Experiments with status |
| `zk-research-requirements` | Research requirements with status and priority |
| `zk-research-target-conference` | Target conferences from the dashboard's `conferences` |
| `zk-project-quick-actions` | Code dashboard quick actions and Refresh |
| `zk-project-requirements` | Requirements with a release dropdown per row |
| `zk-project-releases` | Synced releases |
| `zk-project-commits` | Commits from `Unreleased Commits.md` |

`zk-research-objective-steps` matches steps by the file their `objective` link points to. Its optional `objectivePath` parameter names an objective; if that name no longer resolves (for example after a rename), the block shows "Objective not found".

### Built-in Script Updates

With **Reload default scripts on load** on (the default), the plugin records a hash of each built-in script it writes. On load, a built-in script you have not edited is updated to the latest default, an identical one is left alone, and one you edited is kept; a notice names edited scripts once when a newer default could not be applied. Use **Reset** in Settings → Dataview to restore a default. With the setting off, existing built-in scripts are never changed.

### Custom Scripts

Start a custom script with a block-comment header. The opening `/**` must be on its own line, and each tag is written as `@tag value` (no colon). Without a header, the script ID is the file name.

```javascript
/**
 * @id my-custom-script
 * @name My Custom Script
 * @description Does something useful
 */

const folder = dv.current().file.folder;
dv.table(['Name', 'Status'],
  dv.pages(`"${folder}"`).map(p => [p.file.link, p.status])
);
```

## Configuration

Settings are grouped in four tabs.

**General**

| Setting | Description | Default |
|---------|-------------|---------|
| Fleeting / Literature / Atom / Permanent Default Path | Folder for each note type | `001-Fleeting`, `002-Literature`, `003-Atom`, `004-Permanent` |
| Lexicon / Hub Default Path | Folders read by AI prompt rules and research tables | `005-Lexicon`, `006-Hubs` |
| Search default folder | Starting folder of the search modal | `002-Literature` |

**Projects**

| Setting | Description | Default |
|---------|-------------|---------|
| Research Root Path | Root folder for research projects | `Research` |
| Projects Root Path | Root folder for code projects | `Projects` |
| Gantt Chart Status Colors | PlantUML color per status | see [Gantt Chart](#gantt-chart) |
| AI Prompt Generation | System prompt, Zotero/literature path, max recursion depth, max chars per note, wrapper style (XML or Markdown), and rules | depth `1`, `4000` chars, XML |
| GitHub pull rules | Rules for [pulling files from GitHub](#pulling-files-from-github) | none |

AI prompt rules match linked notes by folder, tag or regex and apply *import full*, *import summary* (named sections), *citation only*, or *ignore*. Citation list entries use `citationKey → Title` for Zotero/Pandoc.

**Dataview**

| Setting | Description | Default |
|---------|-------------|---------|
| Enable Dataview scripts | Register the code block processor | on |
| Dataview scripts folder | Folder for script files | `dataview-scripts` |
| Dataview code block type | Language of the code block | `zettelkasten-query` |
| Reload default scripts on load | Keep unedited built-in scripts up to date (see [Built-in Script Updates](#built-in-script-updates)) | on |
| Show debug panels | Debug output in built-in scripts (last push request, PAT/repo info) | off |
| Scripts | List, edit and reset scripts | |

**Templates**

Each template has a name, category (note type), specific folder, filename prefix (`$date`, `$datetime`, `$year`, `$month`, `$day` or plain text), frontmatter properties and body sections.

## API Reference

### Global Window Object

The plugin exposes `window.ZettelkastenOperator` for use in Dataview scripts. Methods that take `projectPath` expect the path of the project's `Dashboard.md`.

```typescript
interface ZettelkastenOperator {
  // Research projects
  createResearchObjective(projectPath: string, title: string): Promise<TFile>
  createResearchStep(projectPath: string, objectivePath: string, title: string): Promise<TFile>
  createResearchExperiment(projectPath: string, title: string): Promise<TFile>
  createResearchRequirement(projectPath: string, title: string): Promise<TFile>
  createResearchDraft(projectPath: string, title: string, templateOptionIndex?: number): Promise<TFile>
  updateResearchDashboardProperties(projectPath: string, updates: object): Promise<void>
  pushToGitHub(projectPath: string, tokenKey?: string): Promise<{ successCount: number; errorCount: number; lastRequestDebug?: object }>
  getPullRules(): GithubPullRule[]
  setResearchPullRules(projectPath: string, ids: string[]): Promise<void>
  pullFromGitHub(projectPath: string, tokenKey?: string): Promise<{ added: number; updated: number; skipped: number; failed: number; unknownRules: string[]; warnings: string[] }>

  // Code projects (throws an Error with a readable message on failure)
  createCodeRequirement(projectPath: string, title: string): Promise<TFile>
  refreshCodeProject(projectPath: string, tokenKey?: string): Promise<{ releases: number; unreleasedCommits: number; legacyCommitNotes: number }>
  updateProjectDashboardProperties(projectPath: string, updates: object): Promise<void>

  // Drafts and AI prompts
  compileDraft(draftPath: string): Promise<string>
  generateAIPrompt(draftFileOrPath: TFile | string): Promise<string>
  renderDraftsTable(container: HTMLElement, projectPath: string): void

  // Utility
  getGithubTokenKeys(): Promise<string[]>
  getGanttStatusColors(): Record<string, string>
  getSettings(): ZettelkastenSettings
  getLastPushRequestDebug(): object | null
}
```

`tokenKey` is a SecretStorage key; pass `""` for a public repo without a PAT.

### Usage in Dataview Scripts

```javascript
const zk = window.ZettelkastenOperator;
const projectPath = dv.current().file.path;

// Create a new objective
await zk.createResearchObjective(projectPath, "New Objective");

// Pull files with the rules listed in this dashboard's github_pull
const result = await zk.pullFromGitHub(projectPath);

// Refresh a code project (errors are thrown with a readable message)
try {
  await zk.refreshCodeProject(projectPath, "github_token");
} catch (err) {
  new Notice(err.message);
}
```

## Architecture

The plugin has a core (main, settings, types), a service layer (note factory, research and code project managers, draft compiler, prompt generator, GitHub client and helpers), a Dataview layer (code block processor and script manager) and a UI layer (dashboard, search and project modals). For components, call flows and a debugging guide see [docs/architecture.md](docs/architecture.md); for the PlantUML diagrams see [docs/diagrams.md](docs/diagrams.md).

## License

MIT (as declared in `package.json`).
