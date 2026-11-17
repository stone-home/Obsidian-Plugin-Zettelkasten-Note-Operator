<!-- BEGIN SKILLS-HUB CONFIG -->
```yaml
ProjectProfiles:
  - program
  - nodejs
  - obsidian
ProjectFeatures:
  - pm
Clients:
  - cursor
  - claude
  - codex
ProjectCode: OPZO
ProjectPaths:
  docs: docs/
  source: src/
  experiments: experiments/
  artifacts: artifacts/
  pkm: pkm/
  playground: playground/
  tests: src/__tests__/
```
<!-- END SKILLS-HUB CONFIG -->

# Obsidian Zettelkasten Operator

Obsidian plugin (TypeScript, bundled with esbuild) that creates and manages Zettelkasten, code-project, and research-project notes, runs Dataview scripts, and syncs research prompts with GitHub. Standards come from the skills hub cats listed above (`highest-court`, `program`, `nodejs`, `obsidian`, `pm`); this section records only what is specific to this repository.

## Commands

Run every check through the npm scripts, never through hand-typed `npx` commands.

| Check | Command |
| --- | --- |
| Lint (ESLint 9 flat config, `eslint.config.mjs`) | `npm run lint` |
| Type check (production sources) | `npm run typecheck` |
| Type check (tests and mocks, `tsconfig.test.json`) | `npm run typecheck:tests` |
| Format and format check (Prettier, tabs from `.editorconfig`, double quotes) | `npm run format`, `npm run format:check` |
| Tests | `npm test` |
| Tests with the coverage gate | `npm run test:coverage` |
| Production build (type check, then `main.js`) | `npm run build` |

## Layout

- Production sources live in `src/`; `src/main.ts` is the plugin entry module.
- Tests live in `src/__tests__/` (recorded as `ProjectPaths.tests`), mirroring the source tree: a test for `src/service/github/repoPull.ts` goes under `src/__tests__/service/github/`. Name each test file after the module and the behavior it checks, such as `factory.overwrite-confirm.test.ts`, never after a plan item or phase number.
- Test doubles for `obsidian` and `markdown-note-orm` live in `src/__mocks__/`, wired through `moduleNameMapper` in `jest.config.ts`; shared typed builders live in `src/__mocks__/testHelpers.ts`.
- Published documentation lives in `docs/`; requirements, plans, ADRs, and the project brief live flat in `pkm/` under `pm-plan-conventions`.
- `main.js`, `styles.css`, `data.json`, `coverage/`, `playground/`, and `.skills-hub/` are build output or local state and stay out of Git.

## Project conventions

- Exported members carry TSDoc with `@param` and `@returns` when the signature alone does not explain the contract; do not add comments that restate the code.
- Do not exclude source files from coverage to meet the threshold; raise coverage with tests and raise the threshold in `jest.config.ts` when it rises.
