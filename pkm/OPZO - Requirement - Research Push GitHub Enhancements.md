---
project_code: "OPZO"
id: "OPZO-REQ-research-push-github-enhancements"
date: 2026-03-01
type: requirement
status: in-progress
---

# Research Quick Actions and Push to GitHub Enhancements

## Problem

Improves Research Quick Actions and Push to GitHub: require PAT for all pushes, add target branch and configurable target folder on GitHub, use Create vs Update commit message based on file existence, URL-encode path for API requests, add optional debug panel (last request) and a Dataview setting to show/hide debug panels for built-in scripts.

This extends the existing feature [[OPZO - Requirement - Push Prompts to GitHub]].

## Acceptance criteria

- [x] Push to GitHub always uses PAT when a key is configured; if no key, user sees notice and no request is sent.
- [ ] Commit message is "Create {filename} from Obsidian" when the file does not exist on GitHub, and "Update {filename} from Obsidian" when it does; PUT body includes `sha` only when updating.
- [x] Dashboard and Quick Actions support target branch (default `main`) and relative target folder (default `prompts`); values are saved to frontmatter and used for all pushes.
- [ ] Filenames with spaces or special characters succeed (path is URL-encoded in GET and PUT).
- [x] When debug panels are enabled, Research Quick Actions shows last request (URL, method, params, headers, body summary, status, error) and a Refresh button; Project Quick Actions shows its debug block only when the setting is on.
- [ ] After a failed push, debug shows real content length and sufficient error text to diagnose 403 vs read failures.

### Requirements and context

- **PAT for all pushes:** Push to GitHub must always use a Personal Access Token when configured; behaviour must not depend on the "Public" checkbox. If no PAT is selected, show a clear notice.
- **Create vs Update:** The action must check whether the target file exists on GitHub (via Contents API GET). If it exists, use **Update** (include `sha` in body, commit message "Update {filename} from Obsidian"); otherwise use **Create** (no `sha`, commit message "Create {filename} from Obsidian").
- **Target branch:** Users must be able to set the target branch (e.g. `main`) in the Quick Actions panel; value is persisted in dashboard frontmatter (`defaultBranch`) and used for all push requests.
- **Relative target folder on GitHub:** Users must be able to set a relative target folder on GitHub (default `prompts`). Files are pushed to `{targetFolder}/{filename}`. Value is persisted in dashboard frontmatter (`github_target_folder`) and used for all push requests.
- **URL encoding:** Paths in GitHub API requests (GET and PUT) must be properly URL-encoded (e.g. spaces as `%20`) so filenames with spaces or special characters do not cause 403 or failed requests.
- **Debug panel:** Optional debug panel in Research Quick Actions showing last request (URL, method, params, headers, body summary, response status, error message). Visibility controlled by a Dataview setting so all built-in script debug panels can be toggled together.
- **Error and content-length reporting:** When a push fails, debug info must show the actual request (e.g. body content length) and a longer error message so users can distinguish read failures from API (e.g. 403) failures.

## Constraints

None recorded.

## Implementation steps

Commit message: `feat: research quick actions and push-to-github enhancements`

PR title: `feat: research quick actions and push-to-github enhancements`

Execution plan as recorded on 2026-03-01:

- [x] Require PAT for all pushes; read token when `github_token_key` (or callback tokenKey) is set; show notice if missing.
- [x] Before each PUT: GET file by path and branch; if response has `sha`, set commit message to "Update ..." and include `sha` in body; otherwise "Create ..." and omit `sha`.
- [x] Add dashboard frontmatter and Quick Actions field for **target branch** (`defaultBranch`), default `main`.
- [x] Add dashboard frontmatter and Quick Actions field for **relative target folder** (`github_target_folder`), default `prompts`; normalize (trim, strip leading/trailing slashes); build path as `{targetFolder}/{filename}`.
- [x] Encode path for API URLs: split by `/`, `encodeURIComponent` each segment, rejoin; use encoded path in GET and PUT URLs; encode `ref` query parameter for GET.
- [x] Add `LastPushRequestDebug` (url, method, headers, bodySummary, params including targetFolder, responseStatus, errorMessage); persist on plugin after push; expose `getLastPushRequestDebug()` on global API.
- [x] In Research Quick Actions script: add debug panel (last request) and Refresh button when `zk.getSettings().dataviewDebugPanels` is true; show params (repo, defaultBranch, targetFolder, path), headers, body summary, response status, error.
- [x] Add setting `dataviewDebugPanels` (default false); add toggle "Show debug panels (built-in scripts)" on Dataview tab in settings; gate Research and Project Quick Actions debug panels on this setting.
- [x] On push error: record actual `contentLength` and longer `errorMessage` in debug (refactor so base64Content is in scope for catch); separate read-failure handling with "Read failed" message and continue to next file.

References:

- Implementation: `ResearchManager.pushToGitHub()` in `src/service/projects/researchManager.ts`.
- Quick Actions script: `zk-research-quick-actions` in `src/dataview/manager.ts`.
- Settings: `dataviewDebugPanels` in `src/types.ts`, `src/constants.ts`, `src/settings.ts` (Dataview tab).
- Global API: `getLastPushRequestDebug`, `updateResearchDashboardProperties` (with `defaultBranch`, `github_target_folder`) in `src/main.ts`.
- Existing feature doc: [[OPZO - Requirement - Push Prompts to GitHub]].

## Validation

Status checked against `src/` on 2026-11-17:

- PAT: `pushToGitHub` in `src/service/projects/researchManager.ts` returns with a notice before any request when no token key or no stored secret is found.
- Branch and folder: `src/dataview/manager.ts` (`zk-research-quick-actions`) writes `defaultBranch` and `github_target_folder` through `updateResearchDashboardProperties`; `pushToGitHub` reads both, with defaults `main` and `prompts`.
- Debug panels: `src/dataview/manager.ts` gates the Research and Project Quick Actions debug blocks on `zk.getSettings().dataviewDebugPanels`; the Research panel has a Refresh button and reads `getLastPushRequestDebug`.
- Failure detail, partly met: when the commit mutation fails, `pushToGitHub` keeps `contentLength` in `bodySummary` and records `responseStatus` and up to 400 characters of `errorMessage`, so an API failure such as a 403 on the commit shows in debug. `contentLength` is set only after the remote query succeeds, so a failure while reading the branch returns no `lastRequestDebug`.
- Not met: read failures cannot be told apart in debug. `pushToGitHub` reads every prompt with `vault.readBinary` inside one unguarded `Promise.all` before any `lastRequestDebug` is built, so one read error rejects the whole push with no debug entry. No "Read failed" handling remains in `src/` (grep on 2026-11-17), although the last execution-plan step is ticked and still describes it. `src/__tests__/service/projects/researchManager.push-single-commit.test.ts` has no test for a read failure.
- Not met as written: `pushToGitHub` now sends one GraphQL `createCommitOnBranch` commit with the headline "Update N prompts from Obsidian" instead of per-file Contents API GET and PUT, so the per-file Create/Update messages and the URL-encoded GET/PUT path no longer apply to push. Behaviour for filenames with spaces was not tested.

## Open decisions

- Whether the single-commit push (`src/service/projects/researchManager.ts`, `pushToGitHub`) supersedes the per-file Create/Update and URL-encoding criteria, so they can be closed or rewritten.
- Whether a failed read of one prompt should again be reported separately (a "Read failed" message and a debug entry) instead of rejecting the whole push.
