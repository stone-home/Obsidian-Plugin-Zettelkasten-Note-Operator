---
project_code: "OPZO"
id: "OPZO-REQ-note-creation-option-merge"
date: 2026-02-05
type: requirement
status: in-progress
---

# Note Creation Option Merge (Prefix and ExtraInfo)

## Problem

When creating a note from the Zettelkasten Dashboard, the option passed to the create callback must always preserve the option's settings (e.g. prefix, template, properties) and only overlay scenario-specific overrides (e.g. Upgrade sources). This ensures that configuration from **Settings → Create Note Options** is not lost on certain flows.

Background:

- **Create New Note**: User picks a type (fleeting/literature/atom/permanent), then a template option; the callback receives an option built from settings.
- **Upgrade**: Same type/template selection, but the new note must get `sources: [[current-note]]` in frontmatter. The dashboard reuses the same grid and passes "extra params" for that create only.
- **Prefix** (and other `extraInfo` from settings) must apply in both flows. Previously, the Upgrade path replaced the entire `extraInfo` with only the upgrade params, so prefix was lost.

## Acceptance criteria

- [ ] **Create New Note**: Option's prefix (and other extraInfo) from settings is applied (e.g. title becomes `YYYY-MM-DD-MyTitle` when prefix is `$date`).
- [x] **Upgrade**: Same prefix/extraInfo from the selected option is applied, and the new note's frontmatter includes `sources: [[upgraded-from-note]]` in addition to any other option properties.

### Option passed to create callback

Single contract:

- The object passed to `onComplete(optionToPass, title)` must always be an `INoteOption` whose `extraInfo` is of type `INoteOptionExtraParams` (i.e. may include `prefix`, `properties`, etc.), so that:
  - Factory can apply `option.extraInfo?.prefix` via `resolvePrefix` and prepend to title.
  - Factory can pass `option.extraInfo?.properties` (e.g. sources, tags) into note creation.

Create New Note (no scenario params):

- When no scenario-specific params are provided (e.g. Create New Note):
  - `optionToPass.extraInfo` = merge of `selectedOption.extraInfo` with a one-off `properties` that sets `sources: []` (or equivalent default).
  - Preserves `selectedOption.extraInfo.prefix` and any other `extraInfo` fields from settings.

Upgrade (scenario params provided):

- When scenario params are provided (e.g. Upgrade passes `{ properties: { sources: [wikilink] } }`):
  - `optionToPass.extraInfo` must **not** replace the whole `extraInfo` with only the scenario params.
  - Must **merge**: keep `selectedOption.extraInfo` (prefix, existing properties, etc.) and overlay only the scenario's `properties` (e.g. `sources`) into `extraInfo.properties`.
  - Result: prefix and other option settings from Settings are preserved; Upgrade adds/overrides only the necessary frontmatter (e.g. sources).

## Constraints

None recorded.

## Implementation steps

- **Where**: Dashboard `renderCategoryGrid` when building `optionToPass` before `onComplete(optionToPass, title)`.
- **Merge strategy**: For the branch where `noteExtraParams` is present, set `extraInfo: { ...selectedOption.extraInfo, properties: { ...selectedOption.extraInfo?.properties, ...noteExtraParams?.properties } }` so that scenario params extend/override only at the `properties` level.
- **Caller**: Factory `openCreationModal()` callback uses `optionToPass` and applies prefix when `option.extraInfo?.prefix` is set; same option is used for folder, template, and `createZettel(..., option.extraInfo?.properties)`.

## Validation

Status checked against `src/` on 2026-11-17:

- `src/modals/dashboard.ts` builds `optionToPass` by spreading `selectedOption.extraInfo` and merging `properties` with `noteExtraParams?.properties` (Upgrade) or `sources: []` (Create New Note), without mutating `selectedOption`.
- `src/service/factory.ts` applies `option.extraInfo?.prefix` through `resolvePrefix` and passes `option.extraInfo?.properties` into note creation.
- Not met as written: the Create New Note criterion gives the title `YYYY-MM-DD-MyTitle` for prefix `$date`, but `createNoteFromOption` in `src/service/factory.ts` builds `${resolved} - ${title}`, which gives `YYYY-MM-DD - MyTitle`. The test "opens the created note at the prefixed, normalized path" (in `src/__tests__/verify/phase1-a1.test.ts` on 2026-11-17) expects `001-Fleeting/inbox - Idea.md` for prefix `inbox` and passed when run on 2026-11-17. No test checks the full title for prefix `$date`; `resolvePrefix` alone is tested in `src/__tests__/service/factory.test.ts`.

## Open decisions

- Whether the criterion's example should change to the format the code uses (`YYYY-MM-DD - MyTitle`), or the code should change to join prefix and title with `-` as the criterion says.
