# Feature: Push Prompts to GitHub

## Overview

**Push to GitHub** uploads the research project's **prompts** folder (generated AI prompts) to the configured GitHub repository. The plugin no longer pushes the materials folder; users who only need to sync AI prompts to remote can use this flow without compiling drafts to materials.

---

## 1. User Story

As a research project user, I want to push my generated AI prompts to GitHub so that I can version and share prompt files in the remote repo without maintaining or pushing a separate materials folder.

---

## 2. Behavior

### 2.1 Source of truth

- **Source folder**: `{projectFolder}/prompts/` (e.g. `Research/MyProject/prompts/`).
- **Contents pushed**: All `.md` files under that folder.
- **Origin of files**: Files in `prompts/` are created by **Generate AI Prompt** (per draft). The folder is created on first generation if it does not exist.

### 2.2 Push to GitHub flow

- **Trigger**: User clicks **Push to GitHub** in the Research Quick Actions drafts table (or equivalent entry point calling `pushToGitHub(projectPath)`).
- **Config**: Repo and branch are read from the project dashboard frontmatter (`repo`, `defaultBranch`, `public_repo`, `github_token_key` as needed).
- **Validation**:
  - If `repo` is missing: show notice "No GitHub repo configured. Set 'repo' in dashboard frontmatter." and exit.
  - If `prompts` folder does not exist: show notice "Prompts folder not found: {path}. Generate AI prompts first." and exit.
  - If folder exists but has no `.md` files: show notice "No prompts to push. Generate AI prompts first." and exit.
- **Upload**: Each `.md` file in `prompts/` is uploaded to the repo via GitHub Contents API at path `prompts/{filename}`. Create or update (using SHA when updating). Commit message e.g. "Update {filename} from Obsidian".
- **Feedback**: On success, notice "Successfully pushed N files to GitHub."; on partial failure, "Pushed N files, M failed."

### 2.3 Out of scope for this feature

- Pushing the **materials** folder (no longer used by Push to GitHub).
- Creating or updating the prompts folder from this feature (handled by Generate AI Prompt).
- Git operations other than GitHub Contents API (no local git push).

---

## 3. Plugin API

### pushToGitHub(projectPath: string, tokenKey?: string): Promise<void>

- **projectPath**: Full path to the project dashboard file (e.g. `Research/MyProject/Dashboard.md`).
- **tokenKey**: Optional key for SecretStorage when repo is private.
- **Behavior**: Resolve project file, derive `projectFolder`, push all `.md` files from `{projectFolder}/prompts/` to the repo under `prompts/` path. Throws or surfaces notices as in §2.2.

---

## 4. Acceptance Criteria

- [ ] Push to GitHub reads from `{projectFolder}/prompts/` and uploads only `.md` files there.
- [ ] Remote paths in the repo are `prompts/{filename}.md` (no `materials/`).
- [ ] Notices and logs refer to "prompts" (e.g. "No prompts to push", "Prompts folder not found").
- [ ] When prompts folder is missing or empty, user sees a clear message to generate AI prompts first.
- [ ] README and architecture docs state that Push to GitHub uploads the project's prompts folder.

---

## 5. References

- Implementation: `ResearchManager.pushToGitHub()` in `src/service/projects/researchManager.ts`.
- Prompt generation (writes to `prompts/`): `PromptGenerator.generatePrompt()` in `src/service/compiler/promptGenerator.ts`.
- Dashboard frontmatter: `repo`, `defaultBranch`, `public_repo`, `github_token_key`.
