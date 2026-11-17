---
project_code: "OPZO"
id: "OPZO-REQ-draft-tracking"
date: 2026-02-03
type: requirement
status: completed
---

# Research Draft Tracking and Creation

## Problem

Support creating and tracking draft notes for research projects from the dashboard. Drafts are used in the AI pipeline (write → compile → materials → push). Users need a clear view of draft status and a one-click way to create new drafts from the project dashboard.

## Acceptance criteria

- [x] New research project dashboards include Section 1 "AI Pipeline Tracking (Draft Status)" with `zk-research-ai-pipeline-tracking` and Section 2 "Atomic Intelligence" with `zk-research-ai-pipeline` and `zk-research-atomic-notes`.
- [x] No "Requirements" section or requirements dataview in the research dashboard template.
- [x] Draft tracking table shows Draft, Title, Status, Section, Modified for all files in `drafts/`.
- [x] Quick Actions includes a Draft row; Create creates a new draft and clears the input.
- [x] `createResearchDraft(projectPath, title)` creates the file under `drafts/` with correct frontmatter and is exposed on `window.ZettelkastenOperator`.
- [x] Existing tests updated (e.g. default script list includes `zk-research-ai-pipeline-tracking`); all relevant tests pass.

### Requirements section and dashboard structure

- **Remove** the "Requirements" section and its dataview (`zk-research-requirements`) from the research project dashboard template.
- **Move** the literature/paper dataview `zk-research-ai-pipeline` from the former "AI Pipeline" section into **Section 2: Atomic Intelligence (The Ingredients)**, together with `zk-research-atomic-notes`.
- **Add** a new **Section 1: AI Pipeline Tracking (Draft Status)** dedicated to draft status, using a new dataview script.

### Draft status dataview (zk-research-ai-pipeline-tracking)

Purpose: display all draft notes for the current research project with enough detail to see status at a glance.

- **Scope**: Current project's `drafts` folder (`{projectFolder}/drafts/`).
- **Output**: A table with the following columns:
  - **Draft** – Link to the draft file.
  - **Title** – From frontmatter `title` or file name.
  - **Status** – From frontmatter `status` (default `draft`).
  - **Section** – From frontmatter `section_title` (or "-" if missing).
  - **Modified** – File modification time (e.g. `yyyy-MM-dd HH:mm`).
- **Ordering**: By modification time, newest first.
- **Placement**: Rendered in dashboard Section 1: "AI Pipeline Tracking (Draft Status)".

Draft note model (created by createDraft):

- **Path**: `{projectFolder}/drafts/{sanitizedTitle}.md`
- **Frontmatter**: `project` (link to Dashboard), `title`, `section_title`, `status: "draft"`, `tags: ["type/research-draft"]`
- **Base type**: Fleeting (research-draft subtype).

### Quick Actions: create draft (zk-research-quick-actions)

Purpose: allow creating a new draft note for the current project directly from the dashboard Quick Actions block.

- **UI**: One new row in the Research Quick Actions block:
  - Label: **Draft**
  - Text input: placeholder e.g. "Draft title"
  - Button: **Create**
- **Action**: On Create:
  - Read project path from current file context (`dv.current().file.path`).
  - Call `ZettelkastenOperator.createResearchDraft(projectPath, inputValue)`.
  - Clear the input after successful creation.
- **Validation**: Do not call API if the input is empty.
- **Errors**: Duplicate title or missing project surface via existing plugin/API error handling (e.g. Notice).

### Plugin API: createResearchDraft

Purpose: expose draft creation to dataview (and other) scripts that run in the dashboard context.

Signature:

```ts
createResearchDraft(projectPath: string, title: string): Promise<TFile>
```

Behavior:

- Resolve project file by `projectPath` (must be the dashboard file path).
- If project file not found: throw (e.g. "Project not found").
- Delegate to `ResearchManager.createDraft(projectFile, title)`.
- Return the created `TFile` (draft note).

Backend (ResearchManager.createDraft):

- Ensure `{projectFolder}/drafts` exists.
- Sanitize title (trim, replace `/` and `\` with `-`).
- If a file at `drafts/{sanitizedTitle}.md` already exists: throw (e.g. "Draft with this title already exists").
- Create note via existing `createNote()` with:
  - Path: `{projectFolder}/drafts/{sanitizedTitle}.md`
  - Base type: fleeting, subtype: research-draft
  - Frontmatter: `project`, `title`, `section_title`, `status: "draft"`

## Constraints

Out of scope / not required:

- In-dashboard editing of draft content or frontmatter (handled by opening the note).
- Changing status from the tracking table (future enhancement).
- Requirements section or `zk-research-requirements` in the dashboard (removed).

## Implementation steps

None recorded.

## Validation

Status checked against `src/` on 2026-11-17:

- Dashboard template: `src/service/projects/researchManager.ts` (`createDashboard`) has "1. AI Pipeline Tracking (Draft Status)" with `zk-research-ai-pipeline-tracking` and "2. Atomic Intelligence (The Ingredients)" with `zk-research-ai-pipeline` and `zk-research-atomic-notes`, and no Requirements section.
- Table: `src/dataview/manager.ts` (`zk-research-ai-pipeline-tracking`) sorts drafts by `file.mtime` descending and renders Draft, Title, Status, Section, Modified (plus the columns from [[OPZO - Requirement - AI Pipeline Tracking Columns]]).
- Quick Actions: `src/dataview/manager.ts` (`zk-research-quick-actions`) has a Draft row with a "Draft title" input and a Create button that returns early on empty input, calls `zk.createResearchDraft(...)`, and clears the input.
- API: `src/main.ts` exposes `createResearchDraft` on `window.ZettelkastenOperator` and throws "Project not found"; `ResearchManager.createDraft` creates the fleeting `research-draft` note under `drafts/` with `project`, `title`, `section_title`, `status: "draft"`, and throws "Draft with this title already exists." on a duplicate.
- Tests: `src/__tests__/dataview/manager.test.ts` lists `zk-research-ai-pipeline-tracking.js` among default scripts; `npm test -- src/__tests__/dataview/manager.test.ts src/__tests__/dataview/command.test.ts --coverage=false` passed (52 tests) on 2026-11-17.
- Later changes on top of this requirement, observed in the same files: `createResearchDraft` takes an optional template index, the Draft row has a template select, and draft filenames carry the project prefix from [[OPZO - Requirement - Research Gantt and Prefix]].

## Open decisions

None recorded.
