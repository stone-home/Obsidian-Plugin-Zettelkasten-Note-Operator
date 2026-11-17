---
project_code: "OPZO"
type: brief
date: 2026-11-17
---

# OPZO Brief

## Identity and background

- Name: Zettelkasten Operator; Obsidian plugin id `zettelkasten-operator`, display name "Zettelkasten Notes Operator" (`manifest.json`); npm package `obsidian-plugin-zettelkasten-operator` (`package.json`).
- Version 1.13.0 in `manifest.json` and `package.json` as of 2026-11-17; `minAppVersion` 0.15.0; author Stone; license MIT (`package.json`).
- Purpose, from `README.md`: an Obsidian plugin for managing Zettelkasten notes with integrated project management for research papers and code projects.
- Feature areas listed in `README.md`: Zettelkasten note types and Upgrade, research projects with dashboard, Gantt chart, target conferences and draft tracking, AI prompt generation and push to GitHub in one commit, pull from GitHub by rules, code projects synced with GitHub releases, DataviewJS scripts loaded by ID (16 built-in), and configurable note templates.
- Stack: TypeScript bundled with esbuild into `main.js`; Jest with ts-jest; ESLint 9; Prettier (`package.json`, `AGENTS.md`).
- History: first commit "Initial commit" on 2025-12-30 (`git log`).
- Users and deployment beyond the author: unknown.

## Engineering objectives

Recorded from the plan the assistant proposed on 2026-11-17 (stages A to E); these are goals, not measured results. The plan asked three questions. The user replied "一起做" to question 3, which offered stage A alone or stages A to C together, so approval covers at most stages A to C. The plan itself said stages D and E need separate sessions; they remain assistant proposals with no recorded user approval.

- Make lint and format checks run and be trusted, without loosening any rule or threshold to pass (stage A, toolchain).
- Format the codebase once with Prettier (stage B). Quote style: the assistant proposed double quotes, the style the code already uses; the user answered the quote question (double or single) with "按照标准代码开发走", which does not pick a style. In the working tree on 2026-11-17, `.prettierrc.json` no longer sets `singleQuote`, so Prettier uses its default double quotes; tabs come from `.editorconfig`.
- Separate internal notes from published docs: requirements, plans, ADRs and this brief in `pkm/`; only published documentation in `docs/` (stage C).
- Remove `any` from production code and review broad `as` casts, test-first (stage D, separate session).
- Make coverage honest: no source exclusions, a threshold set at the measured value and only raised; typed mocks in place of `any` in tests (stage E, separate session).

Acceptance for each stage: `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm test`, and `npm run test:coverage` pass with the rules and thresholds unchanged or raised (`AGENTS.md`).

## Layout decisions

- `ProjectCode` is `OPZO` and `ProjectPaths` are recorded in the SKILLS-HUB CONFIG block of `AGENTS.md`; `CLAUDE.md` only imports `AGENTS.md`.
- Tests stay in `src/__tests__/`, mirroring the source tree, recorded as `ProjectPaths.tests` instead of the default `tests/` (assistant recommendation from the 2026-11-17 audit, following the pm placement rule to keep a directory that already holds tests; the user has not stated a decision on it).
- Requirements moved from `docs/requirements/` to `pkm/` on 2026-11-17 with `git mv`, renamed to `OPZO - Requirement - <title>.md`, and rewritten to the pm requirement sections; `docs/` keeps `architecture.md`, `diagrams.md` and `diagrams/`.
- ESLint migrated to the flat config `eslint.config.mjs`; `.eslintrc` and `.eslintignore` are deleted in the working tree (observed 2026-11-17, not yet committed).
- Coverage exclusions: removed on 2026-11-17. `jest.config.ts` now excludes only `src/__mocks__/**`, `src/__tests__/**` and `*.test.ts`; measured coverage was 39.16% statements, 41.03% branches, 31.47% functions, 39.96% lines (the earlier 93% figure covered only the non-excluded files).
- `playground/` is git-ignored for scratch work (`.gitignore`).
- This brief's path `pkm/OPZO - Brief.md` was chosen by the assistant from the `AGENTS.md` Layout prose, which says the project brief lives in `pkm/`. `AGENTS.md` has no `ProjectBrief` key, and the user has not confirmed the path (as of 2026-11-17).

## Requirements

Status as checked against `src/` on 2026-11-17; each document records its evidence under Validation.

| Requirement | Created | Status |
| --- | --- | --- |
| [[OPZO - Requirement - Draft Tracking]] | 2026-02-03 | completed |
| [[OPZO - Requirement - Search Modal]] | 2026-02-04 | completed |
| [[OPZO - Requirement - Dataview Scripts]] | 2026-02-05 | in-progress |
| [[OPZO - Requirement - Note Creation Option Merge]] | 2026-02-05 | in-progress |
| [[OPZO - Requirement - AI Pipeline Tracking Columns]] | 2026-02-11 | completed |
| [[OPZO - Requirement - AI Prompt System Prompt]] | 2026-02-11 | completed |
| [[OPZO - Requirement - Push Prompts to GitHub]] | 2026-02-11 | completed |
| [[OPZO - Requirement - Research Gantt and Prefix]] | 2026-02-13 | in-progress |
| [[OPZO - Requirement - Research Push GitHub Enhancements]] | 2026-03-01 | in-progress |

## Open questions

- Dataview Scripts: does the editor modal width `min(1176px, 92vw)` replace the 68.6vw criterion?
- Research Gantt and Prefix: is the dashboard date field `created` (requirement) or `create` (read by `getProjectPrefix`)?
- Research Push GitHub Enhancements: does the single-commit GraphQL push supersede the per-file Create/Update and URL-encoding criteria?
- AI Prompt System Prompt: should the requirement's UI details (12 rows, 200px, `zk-ai-system-prompt-*` classes) be updated to match the code, or the code to match them?
- `.cursorrules`, which asked for a docstring on every function, is deleted in the working tree as of 2026-11-17 (not yet committed); whether any of its content should move into `AGENTS.md` is unknown.
- Coverage threshold: set on 2026-11-17 to the measured values rounded down (statements 39, branches 41, functions 31, lines 39) as a ratchet, raised the same day after the bug-fix tests to statements 57, branches 55, functions 48, lines 57; raising it needs tests for `src/main.ts`, `src/settings.ts`, `src/modals/**` and `src/service/compiler/**`, which are below 35%.
- Brief path: confirm `pkm/OPZO - Brief.md`, and whether to add a `ProjectBrief` key to `AGENTS.md`.
- Approval of stages D and E, and the quote style for stage B: not yet stated by the user.
- Note Creation Option Merge: should the title example become `YYYY-MM-DD - MyTitle` (code), or the code join prefix and title with `-` (requirement)?
- Research Push GitHub Enhancements: should a failed read of one prompt again get its own "Read failed" message and debug entry instead of rejecting the whole push?
