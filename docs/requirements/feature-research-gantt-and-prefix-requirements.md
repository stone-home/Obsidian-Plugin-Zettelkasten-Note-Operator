# Feature Requirement: Research Gantt Enhancements & Project Note Prefix

## Overview

Enhance the research project dashboard and Gantt chart: (1) show objectives, drafts, and experiments in the Gantt with section separators and configurable time granularity; (2) add a Target Conference dataview under Data Pipeline; (3) prefix all research child notes (objective/step/draft/experiment) with a short project code and creation date for quick identification; (4) use short display names in the Gantt (title after " - " only).

---

## 1. Context

- **Research Gantt** (`zk-research-gantt`): Currently shows only objectives. Users need drafts and experiments on the same timeline, grouped by section (Writing / Experiments / Other), with optional time scale (day / week / month).
- **Dashboard frontmatter**: Granularity and conference list should be editable in the Dashboard note (frontmatter) so blocks stay minimal.
- **Note naming**: Research project child notes (objectives, steps, drafts, experiments) should have a consistent prefix (project code + creation date) so they are identifiable at a glance; the prefix and user title are separated by " - ".
- **Gantt display**: In the chart, task labels should show only the title part (after " - ") to avoid long repetitive prefixes.

---

## 2. Research Gantt (zk-research-gantt)

### 2.1 Data Sources

- **Objectives**: `{projectFolder}/objectives` (existing).
- **Drafts**: `{projectFolder}/drafts`; use frontmatter `start`, `end`, or fallback `due` / `file.mtime`.
- **Experiments**: `{projectFolder}/experiments`; same date logic as drafts.

### 2.2 Sections (PlantUML)

- **Writing**: All draft tasks.
- **Experiments**: All experiment tasks.
- **Other**: All objective tasks.

Use PlantUML Gantt section syntax: `-- Writing --`, `-- Experiments --`, `-- Other --`.

### 2.3 Time Granularity

- **Source**: `input.granularity` (code block param) or `dv.current().granularity` (Dashboard frontmatter), default `day`.
- **Values**: `day` | `week` | `month`.
- **PlantUML**: Use `projectscale daily` | `projectscale weekly` | `projectscale monthly` (not `printscale 1 day`).

### 2.4 Gantt Task Display Name

- For chart labels only: if the note name (or title) contains `" - "`, use only the part **after** `" - "`; otherwise use the full name.
- Section prefix (Draft / Exp) is still prepended for drafts and experiments (e.g. "Draft My Title", "Exp Experiment One").

### 2.5 Draft & Experiment Frontmatter

- New drafts and experiments must have `start: ""` and `end: ""` in frontmatter so users can set dates and the Gantt can display them.

---

## 3. Dashboard Frontmatter & Data Pipeline

### 3.1 Default Frontmatter (New Research Projects)

- **conferences**: `[]` – list of CFP note links for the Target Conference dataview.
- **granularity**: `"day"` – default Gantt time scale.
- **project_code**: `""` – optional short code (e.g. ZK, MR26); if empty, derived from project folder name.
- **created**: `YYYY-MM-DD` – project creation date (used in note prefix).

### 3.2 Target Conference Dataview (zk-research-target-conference)

- **Placement**: Under "0. Data Pipeline Visualization", after the Mermaid diagram.
- **Behavior**: Read `conferences` from current note frontmatter; resolve each link; filter by folder `002-Literature/005-CFP/` and tag `type/cfp`; output table: Conference, Location, Submission, Start (fields: location, submission_ddl, start, full-name/acronym).

### 3.3 Gantt Block Hint

- In "4. Objectives Timeline (PlantUML Gantt)", add a line explaining that `granularity` can be set in frontmatter or in the block (e.g. `granularity: "week"`).

---

## 4. Project Note Prefix (Objective / Step / Draft / Experiment)

### 4.1 Prefix Format

- **Prefix**: `{project_code}{YYYYMMDD}` – no hyphen between code and date (e.g. `TP20260213`, `ZK20260101`).
- **Full filename**: `{prefix} - {user_title}.md` – exactly one `" - "` (space-hyphen-space) between prefix and title.
- **Examples**: `TP20260213 - FirstObjective.md`, `ZK20260101 - 实验一.md`.

### 4.2 Project Code Source

- **Primary**: Dashboard frontmatter `project_code` (user-defined, e.g. 2–4 chars).
- **Fallback**: Derived from project folder name: split by hyphen/underspace and camelCase; first letter of each part (e.g. TestProject → TP, My-Research-2026 → MR26).

### 4.3 Creation Date Source

- **Primary**: Dashboard frontmatter `created` (YYYY-MM-DD), normalized to YYYYMMDD for prefix.
- **Fallback**: Dashboard file ctime (creation time).

### 4.4 Where Applied

- `createObjective`, `createStep`, `createDraft`, `createExperiment` all use `getProjectPrefix(projectFile)` and format `{prefix} - {safeTitle}` for the note file path and display title.

---

## 5. Acceptance Criteria

- [ ] Gantt shows three sections: Writing (drafts), Experiments, Other (objectives); each task has start/end or fallback dates.
- [ ] Gantt time scale is configurable via frontmatter `granularity` or block param; PlantUML uses `projectscale daily|weekly|monthly`.
- [ ] Gantt task labels show only the part after " - " (plus section prefix for Draft/Exp when used).
- [ ] New research Dashboard has frontmatter: `conferences`, `granularity`, `project_code`, `created`.
- [ ] Target Conference dataview appears under Data Pipeline and reads `conferences` from frontmatter.
- [ ] New objectives/steps/drafts/experiments get filename `{code}{YYYYMMDD} - {title}.md`; no hyphen between code and date; " - " between prefix and title.
- [ ] New drafts and experiments have `start` and `end` in frontmatter (empty by default).

---

## 6. Technical Notes

- **ResearchManager**: `getProjectCode(projectFile)`, `getProjectPrefix(projectFile)`, `deriveShortCodeFromFolder(projectFolder)`; Dashboard `created` set in `createDashboard()`.
- **Gantt script**: `ganttDisplayName(raw, sectionPrefix)` – indexOf `" - "`, slice after; use for all three sections.
- **Dataview default scripts**: `zk-research-target-conference` added to default list; `zk-research-gantt` extended with drafts/experiments, sections, granularity, and short display names.
