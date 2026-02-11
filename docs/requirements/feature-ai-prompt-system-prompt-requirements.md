# Feature: AI Prompt System-Level Prompt

## Overview

A **system-level prompt** is optional global text configured in Settings (Projects tab, AI Prompt Generation). It is prepended to the **top** of every generated prompt markdown file, before the section title and before any note-level "AI prompt" block from the draft. This lets users define once (e.g. persona, style, or constraints) and have it applied to all generated prompts.

---

## 1. User Story

As a research writer, I want to set a system-level prompt in settings so that every generated AI prompt file starts with the same instructions (e.g. "You are an academic writing assistant…") without repeating them in each draft.

---

## 2. Behavior

### 2.1 Configuration

- **Location**: Settings → **Projects** tab → **AI Prompt Generation** card.
- **UI**: A dedicated section with:
  - **Title**: "System prompt" (same visual style as other AI card subsections).
  - **Description**: "Optional. Prepended to the top of every generated prompt (before the note-level AI prompt section)."
  - **Control**: A multi-line text area on the next row (full width), with placeholder e.g. "e.g. You are an academic writing assistant…". The text area is sized for longer content (e.g. 12 rows, min height 200px, vertically resizable).
- **Storage**: Stored in `ZettelkastenSettings.aiPromptSystemPrompt` (string; empty or whitespace-only is persisted as `undefined`).

### 2.2 Generation order

When building the prompt in `PromptGenerator.buildPrompt()`:

1. If `aiPromptSystemPrompt` is set and non-empty (after trim), output it first.
2. Then a separator (`---` and blank lines).
3. Then the rest: section title, note-level AI prompt block (if any), Persona & Task, Constraints, Author Narrative, Note map, Context from Linked Notes, Citation list, Output format.

So the system prompt has **priority** over the note-level prompt (it appears above it).

### 2.3 Out of scope

- Per-draft or per-project override of the system prompt (future enhancement).
- Storing the system prompt outside settings (e.g. in a file).

---

## 3. Settings

### Type

- **Key**: `aiPromptSystemPrompt?: string`
- **Default**: `undefined` (no system prompt).
- **Description**: System-level prompt text; prepended to the top of every generated prompt when non-empty.

### UI details

- Section uses classes `zk-ai-system-prompt-section`, `zk-ai-system-prompt-row` for layout and styling.
- Text area: full width, 12 rows, min-height 200px, resize vertical.

---

## 4. Acceptance Criteria

- [ ] Settings → Projects → AI Prompt Generation shows a "System prompt" section with title, description, and a full-width text area on the next row.
- [ ] When `aiPromptSystemPrompt` is set, every generated prompt file starts with that text, then `---`, then the section title and remaining content.
- [ ] When empty or undefined, generated prompts are unchanged (no extra content at top).
- [ ] Value is saved and restored across reloads; empty input clears the setting.

---

## 5. References

- Implementation: [src/settings.ts](src/settings.ts) (Projects tab, system prompt section), [src/service/compiler/promptGenerator.ts](src/service/compiler/promptGenerator.ts) (`buildPrompt`).
- Types: [src/types.ts](src/types.ts) (`ZettelkastenSettings.aiPromptSystemPrompt`).
- Styles: [src/styles/cards.css](src/styles/cards.css) (`.zk-ai-system-prompt-*`).
