---
project_code: "OPZO"
id: "OPZO-REQ-research-gantt-and-prefix"
date: 2026-02-13
type: requirement
status: in-progress
---

# Research Gantt Enhancements and Project Note Prefix

## Problem

Enhance the research project dashboard and Gantt chart: (1) show objectives, drafts, and experiments in the Gantt with section separators and configurable time granularity; (2) add a Target Conference dataview under Data Pipeline; (3) prefix all research child notes (objective/step/draft/experiment) with a short project code and creation date for quick identification; (4) use short display names in the Gantt (title after " - " only).

Context:

- **Research Gantt** (`zk-research-gantt`): Currently shows only objectives. Users need drafts and experiments on the same timeline, grouped by section (Writing / Experiments / Other), with optional time scale (day / week / month).
- **Dashboard frontmatter**: Granularity and conference list should be editable in the Dashboard note (frontmatter) so blocks stay minimal.
- **Note naming**: Research project child notes (objectives, steps, drafts, experiments) should have a consistent prefix (project code + creation date) so they are identifiable at a glance; the prefix and user title are separated by " - ".
- **Gantt display**: In the chart, task labels should show only the title part (after " - ") to avoid long repetitive prefixes.

## Acceptance criteria

- [x] Gantt shows three sections: Writing (drafts), Experiments, Other (objectives); each task has start/end or fallback dates.
- [x] Gantt time scale is configurable via frontmatter `granularity` or block param; PlantUML uses `projectscale daily|weekly|monthly`.
- [x] Gantt task labels show only the part after " - " (plus section prefix for Draft/Exp when used).
- [ ] New research Dashboard has frontmatter: `conferences`, `granularity`, `project_code`, `created`.
- [x] Target Conference dataview appears under Data Pipeline and reads `conferences` from frontmatter.
- [x] New objectives/steps/drafts/experiments get filename `{code}{YYYYMMDD} - {title}.md`; no hyphen between code and date; " - " between prefix and title.
- [x] New drafts and experiments have `start` and `end` in frontmatter (empty by default).

### Research Gantt (zk-research-gantt)

Data sources:

- **Objectives**: `{projectFolder}/objectives` (existing).
- **Drafts**: `{projectFolder}/drafts`; use frontmatter `start`, `end`, or fallback `due` / `file.mtime`.
- **Experiments**: `{projectFolder}/experiments`; same date logic as drafts.

Sections (PlantUML):

- **Writing**: All draft tasks.
- **Experiments**: All experiment tasks.
- **Other**: All objective tasks.

Use PlantUML Gantt section syntax: `-- Writing --`, `-- Experiments --`, `-- Other --`.

Time granularity:

- **Source**: `input.granularity` (code block param) or `dv.current().granularity` (Dashboard frontmatter), default `day`.
- **Values**: `day` | `week` | `month`.
- **PlantUML**: Use `projectscale daily` | `projectscale weekly` | `projectscale monthly` (not `printscale 1 day`).

Gantt task display name:

- For chart labels only: if the note name (or title) contains `" - "`, use only the part **after** `" - "`; otherwise use the full name.
- Section prefix (Draft / Exp) is still prepended for drafts and experiments (e.g. "Draft My Title", "Exp Experiment One").

Draft and experiment frontmatter:

- New drafts and experiments must have `start: ""` and `end: ""` in frontmatter so users can set dates and the Gantt can display them.

### Dashboard frontmatter and Data Pipeline

Default frontmatter (new research projects):

- **conferences**: `[]` – list of CFP note links for the Target Conference dataview.
- **granularity**: `"day"` – default Gantt time scale.
- **project_code**: `""` – optional short code (e.g. ZK, MR26); if empty, derived from project folder name.
- **created**: `YYYY-MM-DD` – project creation date (used in note prefix).

Target Conference dataview (zk-research-target-conference):

- **Placement**: Under "0. Data Pipeline Visualization", after the Mermaid diagram.
- **Behavior**: Read `conferences` from current note frontmatter; resolve each link; filter by folder `002-Literature/005-CFP/` and tag `type/cfp`; output table: Conference, Location, Submission, Start (fields: location, submission_ddl, start, full-name/acronym).

Gantt block hint:

- In "4. Objectives Timeline (PlantUML Gantt)", add a line explaining that `granularity` can be set in frontmatter or in the block (e.g. `granularity: "week"`).

### Project note prefix (objective / step / draft / experiment)

Prefix format:

- **Prefix**: `{project_code}{YYYYMMDD}` – no hyphen between code and date (e.g. `TP20260213`, `ZK20260101`).
- **Full filename**: `{prefix} - {user_title}.md` – exactly one `" - "` (space-hyphen-space) between prefix and title.
- **Examples**: `TP20260213 - FirstObjective.md`, `ZK20260101 - 实验一.md`.

Project code source:

- **Primary**: Dashboard frontmatter `project_code` (user-defined, e.g. 2–4 chars).
- **Fallback**: Derived from project folder name: split by hyphen/underspace and camelCase; first letter of each part (e.g. TestProject → TP, My-Research-2026 → MR26).

Creation date source:

- **Primary**: Dashboard frontmatter `created` (YYYY-MM-DD), normalized to YYYYMMDD for prefix.
- **Fallback**: Dashboard file ctime (creation time).

Where applied:

- `createObjective`, `createStep`, `createDraft`, `createExperiment` all use `getProjectPrefix(projectFile)` and format `{prefix} - {safeTitle}` for the note file path and display title.

## Constraints

None recorded.

## Implementation steps

Technical notes:

- **ResearchManager**: `getProjectCode(projectFile)`, `getProjectPrefix(projectFile)`, `deriveShortCodeFromFolder(projectFolder)`; Dashboard `created` set in `createDashboard()`.
- **Gantt script**: `ganttDisplayName(raw, sectionPrefix)` – indexOf `" - "`, slice after; use for all three sections.
- **Dataview default scripts**: `zk-research-target-conference` added to default list; `zk-research-gantt` extended with drafts/experiments, sections, granularity, and short display names.

## Validation

Status checked against `src/` on 2026-11-17:

- Gantt: `src/dataview/manager.ts` (`zk-research-gantt`) reads `drafts`, `experiments`, and `objectives`, builds the sections Writing (`Draft`), Experiments (`Exp`), and Other, maps granularity to `projectscale daily|weekly|monthly`, and labels tasks with `ganttDisplayName`.
- Target Conference: `src/dataview/manager.ts` (`zk-research-target-conference`) filters on `002-Literature/005-CFP/` and `type/cfp` and reads `submission_ddl`; `src/service/projects/researchManager.ts` (`createDashboard`) places it in "0. Data Pipeline Visualization" and adds the `granularity` hint.
- Prefix: `createObjective`, `createStep`, `createDraft`, and `createExperiment` in `src/service/projects/researchManager.ts` all call `getProjectPrefix` and name files `{prefix} - {safeTitle}`; drafts and experiments get `start: ""` and `end: ""`.
- Not met as written: `createDashboard` writes `conferences: []`, `granularity: "day"`, and `project_code: ""` but no `created` field; `getProjectPrefix` reads the frontmatter field `create` (its comment says markdown-note-orm writes it) and falls back to the file ctime.

## Open decisions

- Whether the dashboard date field is `created`, as this requirement states, or `create`, which `getProjectPrefix` reads today.
