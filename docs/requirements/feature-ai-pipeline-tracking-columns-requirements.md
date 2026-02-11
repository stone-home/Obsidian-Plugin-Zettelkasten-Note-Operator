# Feature: AI Pipeline Tracking Table — Copies, Last Prompt Date, Link

## Overview

Extend the research draft tracking dataview (`zk-research-ai-pipeline-tracking`) so the table shows, per draft: how many AI prompt files exist for that draft, the date of the most recent prompt, and a clickable link to that latest AI prompt note. This helps users see at a glance which drafts have been sent to the AI pipeline and jump directly to the latest prompt.

---

## 1. User Story

As a research writer, I want the draft status table to show how many prompt copies each draft has, when the last one was generated, and a link to open it, so I can track the AI pipeline and open the latest prompt without hunting in the `prompts/` folder.

---

## 2. Scope

- **Script**: `zk-research-ai-pipeline-tracking` (Research AI Pipeline Tracking (Draft Status)).
- **Data source**: Existing drafts from `{projectFolder}/drafts/`; prompt files from `{projectFolder}/prompts/` with naming `{draftBasename}_prompt_v{YYYYMMDD}.md` (see [PromptGenerator](src/service/compiler/promptGenerator.ts)).
- **Extends**: [Feature: Research Draft Tracking & Creation](feature-draft-tracking-requirements.md) (Section 2).

---

## 3. New Table Columns

The draft status table SHALL include three additional columns after **Modified**:

| Column              | Description |
|---------------------|-------------|
| **Copies**          | Number of AI prompt files for this draft (files in `prompts/` whose name starts with `{draftBasename}_prompt_v`). |
| **Last prompt date**| Modification time of the *semantically* latest prompt file, formatted as `yyyy-MM-dd HH:mm`, or `-` if none. |
| **Last prompt**     | Clickable link to that latest AI prompt note (`file.link`), or `-` if none. |

- When a draft has no matching prompts: show **Copies** `0`, **Last prompt date** `-`, **Last prompt** `-`.

---

## 4. Behavior and Design Notes

### 4.1 “Latest” by filename, not mtime

“Latest” prompt SHALL be determined by **filename** (descending), not by file modification time. Prompt filenames include `_v{YYYYMMDD}`; sorting by `file.name` descending yields the correct latest version. Using `mtime` would be wrong when files are synced (e.g. iCloud, Obsidian Sync, Git) or when an older prompt is edited.

### 4.2 Performance

Prompt-to-draft association SHALL use a **single pre-index** (e.g. a `Map` keyed by draft stem). Parsing prompt filenames with `split('_prompt_v')` and grouping once avoids O(drafts × prompts) per-row filtering as the project grows.

### 4.3 Draft stem

Draft stem (basename without extension) SHALL be taken from `d.file.basename` when available (Dataview), otherwise from `d.file.name.replace(/\.md$/i, '')`, so it matches the stem used in prompt filenames by `PromptGenerator`.

---

## 5. Acceptance Criteria

- [ ] Draft tracking table includes columns: Draft, Title, Status, Section, Modified, **Copies**, **Last prompt date**, **Last prompt**.
- [ ] **Copies** shows the count of prompt files in `prompts/` whose name matches `{draftBasename}_prompt_v*.md`.
- [ ] **Last prompt date** shows the formatted date of the latest prompt by **filename** (e.g. `localeCompare` descending), or `-` when there are no prompts.
- [ ] **Last prompt** is a clickable link to the latest prompt note, or `-` when there are no prompts.
- [ ] Implementation uses a pre-index (e.g. `promptMap`) for O(drafts + prompts) behavior.
- [ ] Unit test(s) verify that the default script content includes prompt map, `_prompt_v` parsing, and sort-by-filename logic (e.g. `localeCompare`).

---

## 6. References

- Implementation: [src/dataview/manager.ts](src/dataview/manager.ts) (script for `id: "zk-research-ai-pipeline-tracking"`).
- Prompt file naming and location: [src/service/compiler/promptGenerator.ts](src/service/compiler/promptGenerator.ts) (`generatePrompt`, `promptsFolder`, `{basename}_prompt_v{date}.md`).
- Draft tracking base feature: [feature-draft-tracking-requirements.md](feature-draft-tracking-requirements.md).
