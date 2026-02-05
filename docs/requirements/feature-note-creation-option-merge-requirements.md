# Feature Requirement: Note Creation Option Merge (Prefix & ExtraInfo)

## Overview

When creating a note from the Zettelkasten Dashboard, the option passed to the create callback must always preserve the option’s settings (e.g. prefix, template, properties) and only overlay scenario-specific overrides (e.g. Upgrade sources). This ensures that configuration from **Settings → Create Note Options** is not lost on certain flows.

---

## Background

- **Create New Note**: User picks a type (fleeting/literature/atom/permanent), then a template option; the callback receives an option built from settings.
- **Upgrade**: Same type/template selection, but the new note must get `sources: [[current-note]]` in frontmatter. The dashboard reuses the same grid and passes “extra params” for that create only.
- **Prefix** (and other `extraInfo` from settings) must apply in both flows. Previously, the Upgrade path replaced the entire `extraInfo` with only the upgrade params, so prefix was lost.

---

## Requirements

### 1. Option Passed to Create Callback

**1.1 Single contract**

- The object passed to `onComplete(optionToPass, title)` must always be an `INoteOption` whose `extraInfo` is of type `INoteOptionExtraParams` (i.e. may include `prefix`, `properties`, etc.), so that:
  - Factory can apply `option.extraInfo?.prefix` via `resolvePrefix` and prepend to title.
  - Factory can pass `option.extraInfo?.properties` (e.g. sources, tags) into note creation.

**1.2 Create New Note (no scenario params)**

- When no scenario-specific params are provided (e.g. Create New Note):
  - `optionToPass.extraInfo` = merge of `selectedOption.extraInfo` with a one-off `properties` that sets `sources: []` (or equivalent default).
  - Preserves `selectedOption.extraInfo.prefix` and any other `extraInfo` fields from settings.

**1.3 Upgrade (scenario params provided)**

- When scenario params are provided (e.g. Upgrade passes `{ properties: { sources: [wikilink] } }`):
  - `optionToPass.extraInfo` must **not** replace the whole `extraInfo` with only the scenario params.
  - Must **merge**: keep `selectedOption.extraInfo` (prefix, existing properties, etc.) and overlay only the scenario’s `properties` (e.g. `sources`) into `extraInfo.properties`.
  - Result: prefix and other option settings from Settings are preserved; Upgrade adds/overrides only the necessary frontmatter (e.g. sources).

### 2. Implementation Notes

- **Where**: Dashboard `renderCategoryGrid` when building `optionToPass` before `onComplete(optionToPass, title)`.
- **Merge strategy**: For the branch where `noteExtraParams` is present, set  
  `extraInfo: { ...selectedOption.extraInfo, properties: { ...selectedOption.extraInfo?.properties, ...noteExtraParams?.properties } }`  
  so that scenario params extend/override only at the `properties` level.
- **Caller**: Factory `openCreationModal()` callback uses `optionToPass` and applies prefix when `option.extraInfo?.prefix` is set; same option is used for folder, template, and `createZettel(..., option.extraInfo?.properties)`.

---

## Acceptance

- **Create New Note**: Option’s prefix (and other extraInfo) from settings is applied (e.g. title becomes `YYYY-MM-DD-MyTitle` when prefix is `$date`).
- **Upgrade**: Same prefix/extraInfo from the selected option is applied, and the new note’s frontmatter includes `sources: [[upgraded-from-note]]` in addition to any other option properties.
