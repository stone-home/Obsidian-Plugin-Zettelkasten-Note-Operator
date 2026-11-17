---
project_code: "OPZO"
id: "OPZO-REQ-push-prompts-to-github"
date: 2026-02-11
type: requirement
status: completed
---

# Push Prompts to GitHub

## Problem

**Push to GitHub** uploads the research project's **prompts** folder (generated AI prompts) to the configured GitHub repository. The plugin no longer pushes the materials folder; users who only need to sync AI prompts to remote can use this flow without compiling drafts to materials.

User story: as a research project user, I want to push my generated AI prompts to GitHub so that I can version and share prompt files in the remote repo without maintaining or pushing a separate materials folder.

## Acceptance criteria

- [x] Push to GitHub reads from `{projectFolder}/prompts/` and uploads only `.md` files there.
- [x] Remote paths in the repo are `prompts/{filename}.md` (no `materials/`).
- [x] Notices and logs refer to "prompts" (e.g. "No prompts to push", "Prompts folder not found").
- [x] When prompts folder is missing or empty, user sees a clear message to generate AI prompts first.
- [x] README and architecture docs state that Push to GitHub uploads the project's prompts folder.

### Source of truth

- **Source folder**: `{projectFolder}/prompts/` (e.g. `Research/MyProject/prompts/`).
- **Contents pushed**: All `.md` files under that folder.
- **Origin of files**: Files in `prompts/` are created by **Generate AI Prompt** (per draft). The folder is created on first generation if it does not exist.

### Push to GitHub flow

- **Trigger**: User clicks **Push to GitHub** in the Research Quick Actions drafts table (or equivalent entry point calling `pushToGitHub(projectPath)`).
- **Config**: Repo and branch are read from the project dashboard frontmatter (`repo`, `defaultBranch`, `public_repo`, `github_token_key` as needed).
- **Validation**:
  - If `repo` is missing: show notice "No GitHub repo configured. Set 'repo' in dashboard frontmatter." and exit.
  - If `prompts` folder does not exist: show notice "Prompts folder not found: {path}. Generate AI prompts first." and exit.
  - If folder exists but has no `.md` files: show notice "No prompts to push. Generate AI prompts first." and exit.
- **Upload**: Each `.md` file in `prompts/` is uploaded to the repo via GitHub Contents API at path `prompts/{filename}`. Create or update (using SHA when updating). Commit message e.g. "Update {filename} from Obsidian".
- **Feedback**: On success, notice "Successfully pushed N files to GitHub."; on partial failure, "Pushed N files, M failed."

### Plugin API

`pushToGitHub(projectPath: string, tokenKey?: string): Promise<void>`

- **projectPath**: Full path to the project dashboard file (e.g. `Research/MyProject/Dashboard.md`).
- **tokenKey**: Optional key for SecretStorage when repo is private.
- **Behavior**: Resolve project file, derive `projectFolder`, push all `.md` files from `{projectFolder}/prompts/` to the repo under `prompts/` path. Throws or surfaces notices as in the push flow above.

## Constraints

Out of scope for this feature:

- Pushing the **materials** folder (no longer used by Push to GitHub).
- Creating or updating the prompts folder from this feature (handled by Generate AI Prompt).
- Git operations other than GitHub Contents API (no local git push).

## Implementation steps

- Implementation: `ResearchManager.pushToGitHub()` in `src/service/projects/researchManager.ts`.
- Prompt generation (writes to `prompts/`): `PromptGenerator.generatePrompt()` in `src/service/compiler/promptGenerator.ts`.
- Dashboard frontmatter: `repo`, `defaultBranch`, `public_repo`, `github_token_key`.

## Validation

Status checked against `src/` and `docs/` on 2026-11-17:

- `pushToGitHub` in `src/service/projects/researchManager.ts` reads `{projectFolder}/prompts`, keeps only children with extension `md`, and writes them to `{targetFolder}/{name}`, where `targetFolder` defaults to `prompts`.
- The same function shows "No GitHub repo configured. Set 'repo' in dashboard frontmatter.", "Prompts folder not found: {path}. Generate AI prompts first.", and "No prompts to push. Generate AI prompts first."
- `README.md` marks `prompts/` as "Generated AI prompts (pushed to GitHub)"; `docs/architecture.md` describes the push of `prompts/` as one GraphQL commit.
- Later behaviour, observed in the same function: the upload is no longer per-file through the Contents API; it is one GraphQL `createCommitOnBranch` commit of the changed prompts, with the notice "Pushed N prompts to GitHub in one commit." See [[OPZO - Requirement - Research Push GitHub Enhancements]].

## Open decisions

None recorded.
