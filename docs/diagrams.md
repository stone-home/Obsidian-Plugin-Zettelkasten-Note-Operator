# Architecture Diagrams

This document contains all PlantUML diagrams for the Zettelkasten Operator plugin. These diagrams illustrate the class structure, component relationships, and key execution flows.

**How to view these diagrams:**

1. **Online**: Copy the PlantUML code and paste it into [plantuml.com/plantuml](https://plantuml.com/plantuml)
2. **VS Code**: Install the "PlantUML" extension, then open the `.puml` files in `docs/diagrams/`
3. **CLI**: Install PlantUML and run `plantuml docs/diagrams/*.puml` to generate images

---

## 1. Class Diagram

**Purpose**: Shows all major classes, their relationships, and the four architectural layers (Plugin Core, Service Layer, Dataview Layer, UI Layer).

**Key insights**:
- `MyPlugin` holds `NoteFactory` and optional `DataviewCommand`
- Managers (`ResearchManager`, `CodeProjectManager`) are created on-demand, not held as singletons
- `DataviewCommand` wraps `DataviewJSManager` which manages script loading and execution
- All modals are opened from `Dashboard` or directly from `NoteFactory`

```plantuml
@startuml class
!theme plain
skinparam classAttributeIconSize 0
skinparam classFontStyle bold

title Zettelkasten Operator — Class Overview

package "Plugin Core" {
  class MyPlugin {
    + settings: ZettelkastenSettings
    + factory: NoteFactory
    + dataview?: DataviewCommand
    --
    + onload(): Promise<void>
    + loadSettings(): Promise<void>
    + saveSettings(): Promise<void>
    - registerGlobalActions(): void
    + onunload(): void
  }

  class SampleSettingTab {
    - plugin: MyPlugin
    - activeTab: general | projects | dataview | templates
    - editingIndex: number | null
    --
    + display(): void
    - renderGeneralSettings(container)
    - renderProjectsSettings(container)
    - renderDataviewSettings(container)
    - renderSummaryView(container)
    - renderDetailView(container, index)
  }

  class ZettelkastenSettings <<interface>> {
    dateFormat
    fleetingPath
    literaturePath
    atomPath
    permanentPath
    researchRootPath
    projectRootPath
    dataviewEnabled
    dataviewQueryPath
    dataviewCodeBlockType
    searchDefaultPath
    ganttStatusColors
    createNoteOptions
  }
}

package "Service Layer" {
  class NoteFactory {
    - app: App
    - settings: ZettelkastenSettings
    --
    + initialize(settings): Promise<void>
    + openCreationModal(): void
    + createZettel(type, title, folder, config?, extra?): Promise<ZettelNoteModel>
    + loadNote(path): Promise<ZettelNoteModel>
    + loadActiveNote(): Promise<ZettelNoteModel>
  }

  class ResearchManager {
    - app: App
    - settings: ZettelkastenSettings
    --
    + createProject(name): Promise<TFile>
    + createObjective(projectFile, title): Promise<TFile>
    + createStep(projectFile, objectiveFile, title): Promise<TFile>
    + createExperiment(projectFile, title): Promise<TFile>
    + createRequirement(projectFile, title): Promise<TFile>
    + createDraft(projectFile, title, templateConfig?): Promise<TFile>
    + listProjects(): Promise<TFile[]>
    + updateDashboardProperties(filePath, updates): Promise<void>
    + pushToGitHub(projectFile, tokenKey?): Promise<void>
    - createNote(...): Promise<TFile>
    - ensureFolder(path): Promise<void>
  }

  class CodeProjectManager {
    - app: App
    - settings: ZettelkastenSettings
    --
    + createProject(name): Promise<TFile>
    + createRequirement(projectFile, title): Promise<TFile>
    + refreshProject(projectFile, tokenKey?): Promise<void>
    + updateDashboardProperties(filePath, updates): Promise<void>
    + listProjects(): Promise<TFile[]>
    - createNote(...): Promise<TFile>
    - upsertRelease(folder, projectFile, release): Promise<void>
    - upsertCommit(folder, projectFile, commit): Promise<void>
  }

  class DraftCompiler {
    - app: App
    - settings: ZettelkastenSettings
    --
    + resolveConfig(draftFile): Promise<CompileConfig | null>
    + compileDraft(draft, cfg): Promise<string>
    + updateManifest(cfg, sectionId, newPath): Promise<void>
    - processWikiLinks(line): Promise<string>
    - expandNote(noteName, fullContent): Promise<string>
  }

  class PromptGenerator {
    - app: App
    - settings: ZettelkastenSettings
    --
    + generatePrompt(draft): Promise<string>
    - extractLinks(content): string[]
    - classifyLinks(links): Promise<ClassifiedLinks>
    - cleanNarrative(content): string
    - buildPrompt(...): string
  }

  class GitHubClient {
    - token: string
    --
    + listReleases(owner, repo): Promise<any[]>
    + compareCommits(owner, repo, base, head): Promise<any>
    - getJson<T>(url): Promise<T>
  }
}

package "Dataview Layer" {
  class DataviewCommand {
    - app: App
    - plugin: MyPlugin
    - dataviewManager: DataviewJSManager
    - processorRegistered: boolean
    --
    + initialize(): Promise<void>
    + refresh(): Promise<void>
    + unload(): void
    - registerCodeBlockProcessor(): void
    - processDvjsBlock(source, el, ctx): Promise<void>
  }

  class DataviewJSManager {
    - scripts: Map<string, IDataviewScript>
    - scriptCache: Map<string, string>
    - scriptsFolder: string
    - fileWatcherRef: EventRef[]
    --
    + onload(): Promise<void>
    + getScript(id): IDataviewScript | undefined
    + executeScript(scriptId, container, params, ctx?): Promise<void>
    + cleanUpFileWatchers(): void
    - createDefaultScripts(): Promise<void>
    - loadAllScripts(): Promise<void>
    - loadScript(file): Promise<void>
    - registerFileWatchers(): void
    - createScript(id, name, content, options?): Promise<IDataviewScript>
  }

  class DataviewScriptBuilder {
    - manager: DataviewJSManager
    - script: Partial<IDataviewScript>
    --
    + id(id): this
    + name(name): this
    + description(desc): this
    + content(scriptContent): this
    + build(): Promise<IDataviewScript>
  }
}

package "UI Layer (Modals)" {
  class Dashboard {
    - settings: ZettelkastenSettings
    - factory: NoteFactory
    - onComplete: OnNoteCreateCallback
    --
    + onOpen(): void
    - renderQuickAccess(container)
    - renderNewNoteSection(container)
    - renderActiveNoteSection(container)
    - renderUpgradeSection(container)
    - renderCategoryGrid(container, types)
  }

  class SearchModal {
    - settings: ZettelkastenSettings
    - factory: NoteFactory
    - targetDirectory: string
    - searchResults: ISearchResult[]
    --
    + onOpen(): void
    - refreshAllResults(): void
    - performSearch(): void
    - handleCreateOpen(name): void
  }

  class TemplateGridModal {
    - noteType: NoteType
    - options: INoteOption[]
    - onChoose: (item: INoteOption) => void
    --
    + onOpen(): void
  }

  class FileNameModal {
    - referencePath: string
    - onSubmit: (title: string) => Promise<void> | void
    --
    + onOpen(): void
  }

  class ResearchProjectsModal {
    - settings: ZettelkastenSettings
    --
    + onOpen(): void
  }

  class CodeProjectsModal {
    - settings: ZettelkastenSettings
    --
    + onOpen(): void
  }
}

' Relationships
MyPlugin --> NoteFactory : holds
MyPlugin --> DataviewCommand : holds (optional)
MyPlugin --> SampleSettingTab : adds tab
MyPlugin ..> ZettelkastenSettings : uses
MyPlugin ..> ResearchManager : creates on demand
MyPlugin ..> CodeProjectManager : creates on demand
MyPlugin ..> DraftCompiler : creates on demand
MyPlugin ..> PromptGenerator : creates on demand

SampleSettingTab --> MyPlugin : plugin
SampleSettingTab ..> ZettelkastenSettings : edits

NoteFactory --> Dashboard : opens
NoteFactory ..> ZettelkastenSettings : uses
Dashboard --> TemplateGridModal : opens
Dashboard --> FileNameModal : opens
Dashboard --> SearchModal : opens
Dashboard --> ResearchProjectsModal : opens
Dashboard --> CodeProjectsModal : opens
Dashboard --> NoteFactory : uses

DataviewCommand --> DataviewJSManager : holds
DataviewJSManager --> DataviewScriptBuilder : createScriptBuilder()
DataviewJSManager ..> MyPlugin : plugin.settings

CodeProjectManager --> GitHubClient : uses

@enduml
```

---

## 2. Sequence: Create New Note

**Purpose**: Shows the complete flow from user clicking the ribbon icon to a note being created in the vault.

**Key steps**:
1. User triggers ribbon/command → `NoteFactory.openCreationModal()`
2. Dashboard opens → user selects note type → TemplateGridModal → FileNameModal
3. `NoteFactory.createZettel()` calls `markdown-note-orm`'s `LibFactory.createByType()`
4. Note is saved to vault with frontmatter and body

**When to reference**: Debugging note creation issues, understanding template/prefix resolution, or tracing where frontmatter comes from.

```plantuml
@startuml sequence-create-note
!theme plain
title Sequence: Create New Note (Dashboard → Vault)

actor User
participant "Ribbon / Command" as Cmd
participant "MyPlugin" as Plugin
participant "NoteFactory" as Factory
participant "Dashboard" as Dashboard
participant "TemplateGridModal" as Template
participant "FileNameModal" as Filename
participant "markdown-note-orm\nLibFactory" as Lib
participant "Vault" as Vault

User -> Cmd : Click ribbon or "Create New Zettel Note"
Cmd -> Plugin : (callback)
Plugin -> Factory : openCreationModal()

Factory -> Dashboard : new Dashboard(app, settings, factory, onComplete)\n.open()
activate Dashboard
Dashboard -> User : Show "Zettelkasten Control" (Quick Actions, Create New Note, Active Context)

User -> Dashboard : Click note type (e.g. Permanent)
Dashboard -> Template : new TemplateGridModal(noteType, options, onChoose)\n.open()
activate Template
Template -> User : Show template cards
User -> Template : Click template
Template -> Dashboard : onChoose(selectedOption)
deactivate Template

Dashboard -> Filename : new FileNameModal(folder, onSubmit)\n.open()
activate Filename
Filename -> User : "New Note in: 004-Permanent"
User -> Filename : Enter title
Filename -> Dashboard : onSubmit(title)
deactivate Filename

Dashboard -> Factory : onComplete(optionToPass, title)
note right: optionToPass includes template + prefix; title may be prefixed

Factory -> Factory : resolvePrefix(option.extraInfo.prefix) if set
Factory -> Lib : createByType(app, fullPath, type, title, specificConfig)
activate Lib
Lib -> Vault : create / modify file at fullPath
Vault --> Lib : file
Lib --> Factory : ZettelNoteModel
deactivate Lib

Factory -> Factory : note.properties.batchUpdate(noteExtraParams) if any
Factory -> Factory : note.save()
Factory -> Vault : write frontmatter + body
Factory -> User : Notice("Created: ...")
opt openAfterCreation
  Factory -> Vault : workspace.openLinkText(fullPath, ...)
end
Factory -> Dashboard : (callback done)
Dashboard -> Dashboard : close()
deactivate Dashboard

@enduml
```

---

## 3. Sequence: Dataview Code Block Execution

**Purpose**: Illustrates how a ` ```zettelkasten-query ` code block in a note triggers script execution and how scripts call back into the plugin via `window.ZettelkastenOperator`.

**Key steps**:
1. Obsidian renders markdown → code block processor (`DataviewCommand`) intercepts
2. `DataviewCommand` parses script ID and params → delegates to `DataviewJSManager`
3. Manager loads script from cache/vault → passes to Dataview's `executeJs()`
4. Script runs in Dataview context → calls `ZettelkastenOperator` methods → creates managers → vault operations

**When to reference**: Debugging "Script not found", understanding how scripts access `dv.current().file.path`, or tracing why a Quick Action button doesn't work.

```plantuml
@startuml sequence-dataview-execute
!theme plain
title Sequence: Dataview Code Block Execution

actor User
participant "Note (markdown)" as Note
participant "Obsidian\nMarkdown render" as Render
participant "DataviewCommand" as Cmd
participant "DataviewJSManager" as Mgr
participant "Dataview plugin\napi.executeJs" as DV
participant "Script (JS)" as Script
participant "window.ZettelkastenOperator" as API
participant "ResearchManager\nor CodeProjectManager" as Manager
participant "Vault" as Vault

User -> Note : Open note containing\n``` zettelkasten-query\nzk-research-quick-actions\n```
Note -> Render : Render code block (language = zettelkasten-query)

Render -> Cmd : registerMarkdownCodeBlockProcessor callback\nprocessDvjsBlock(source, el, ctx)
activate Cmd
Cmd -> Cmd : Parse source: scriptId = first line\nparams = key: value lines
Cmd -> Mgr : executeScript(scriptId, el, params, ctx)

activate Mgr
Mgr -> Mgr : getScript(scriptId)
alt Script not found
  Mgr -> Mgr : container.setText("Error: Script '...' not found")
  Mgr --> Cmd : return
end
Mgr -> Mgr : scriptContent = scriptCache.get(scriptId)\nor read from vault
Mgr -> Mgr : cleanCode = strip header comment\ncodeWithParams = "const input = " + JSON.stringify(params) + ";\n" + cleanCode
Mgr -> DV : dataviewApi.executeJs(codeWithParams, container, this, sourcePath)
deactivate Mgr

activate DV
DV -> Script : Run script in Dataview JS context\n(dv, input, app, ... available)
activate Script
note right of Script : Script uses dv.current().file.path\nand may call ZettelkastenOperator
Script -> API : e.g. createResearchDraft(projectPath, title)
API -> Manager : new ResearchManager(app, settings)\nmanager.createDraft(projectFile, title)
activate Manager
Manager -> Vault : ensureFolder(drafts); createNote(...)
Vault --> Manager : TFile
Manager --> API : TFile
deactivate Manager
API --> Script : (return)
Script -> Script : Render UI (buttons, tables) into container
Script --> DV : (done)
deactivate Script
DV --> Mgr : (done)
deactivate DV
Mgr --> Cmd : (done)
deactivate Cmd

@enduml
```

---

## 4. Sequence: Research Quick Action — Create Draft

**Purpose**: Shows how a user action in a Research Dashboard note (clicking "Create" in the Quick Actions block) creates a draft file.

**Key steps**:
1. User opens Research Dashboard → Dataview block renders → Quick Actions UI appears
2. User enters draft title → clicks Create → script calls `ZettelkastenOperator.createResearchDraft()`
3. Plugin resolves project file → creates `ResearchManager` → `createDraft()` → `createNote()` → vault

**When to reference**: Debugging "Project not found" errors, understanding how `dv.current().file.path` is used, or tracing draft creation failures.

```plantuml
@startuml sequence-research-create
!theme plain
title Sequence: Research Quick Action — Create Draft (from Dashboard note)

actor User
participant "Research Dashboard\n(markdown note)" as Note
participant "Dataview block\nzk-research-quick-actions" as Block
participant "window.ZettelkastenOperator" as API
participant "MyPlugin\nregisterGlobalActions" as Plugin
participant "ResearchManager" as RM
participant "markdown-note-orm\nLibFactory" as Lib
participant "Vault" as Vault

User -> Note : Open Research project Dashboard
Note -> Block : Render block (script runs in Dataview context)
activate Block
Block -> Block : projectPath = dv.current().file.path\n(e.g. Research/MyProject/Dashboard.md)
User -> Block : Enter "Draft title", click Create
Block -> API : createResearchDraft(projectPath, title, templateOptionIndex?)

activate API
API -> Plugin : (closure over plugin instance)
Plugin -> Plugin : getAbstractFileByPath(projectPath) -> projectFile
alt Project file not found
  API --> Block : throw new Error("Project not found")
end
Plugin -> RM : new ResearchManager(app, settings)\n.createDraft(projectFile, title, templateConfig)
activate RM

RM -> RM : getProjectFolder(projectFile) -> projectFolder\nfolder = projectFolder + "/drafts"
RM -> Vault : ensureFolder(folder)
RM -> RM : sanitizeSegment(title) -> safeTitle\nfilePath = folder + "/" + safeTitle + ".md"
alt File already exists
  RM --> API : throw new Error("Draft with this title already exists.")
end
RM -> Lib : createByType(app, filePath, "fleeting", safeTitle, config)\nconfig: tags type/research-draft, project, title, section_title, status
Lib -> Vault : create file
Vault --> Lib : (file)
Lib --> RM : (note)
RM -> RM : note.save()
RM --> API : TFile (draft)
deactivate RM
API --> Block : TFile
deactivate API

Block -> Block : Clear input; (optional) refresh view
deactivate Block

@enduml
```

---

## 5. Sequence: Code Project Refresh

**Purpose**: Shows how refreshing a code project fetches GitHub releases and commits, then creates/updates vault files.

**Key steps**:
1. User clicks Refresh in Quick Actions → `refreshCodeProject()` → `CodeProjectManager.refreshProject()`
2. Manager reads dashboard frontmatter (repo, token key) → resolves token from SecretStorage
3. `GitHubClient.listReleases()` → GitHub API → releases array
4. For each release: `upsertRelease()` → create/update `releases/{tag}.md`
5. `GitHubClient.compareCommits()` → unreleased commits → `upsertCommit()` → create/update `commits/{sha}.md`

**When to reference**: Debugging GitHub API failures, understanding token resolution, or tracing why releases/commits aren't syncing.

```plantuml
@startuml sequence-code-refresh
!theme plain
title Sequence: Code Project Refresh (GitHub releases + unreleased commits)

actor User
participant "Code Dashboard\nQuick Actions" as Block
participant "window.ZettelkastenOperator" as API
participant "MyPlugin" as Plugin
participant "CodeProjectManager" as CM
participant "GitHubClient" as GH
participant "GitHub API" as GitHub
participant "Vault" as Vault

User -> Block : Click "Refresh" (with PAT selected)
Block -> API : refreshCodeProject(projectPath, tokenKey?)
activate API
API -> Plugin : (closure)
Plugin -> Plugin : getAbstractFileByPath(projectPath) -> projectFile
Plugin -> CM : new CodeProjectManager(app, settings)\n.refreshProject(projectFile, tokenKey?)
activate CM

CM -> CM : metadataCache.getFileCache(projectFile).frontmatter\nrepo, defaultBranch, github_token_key, public_repo
CM -> CM : Resolve token: SecretStorage.getSecret(resolvedKey) or "" for public
alt tokenKey provided and != frontmatter
  CM -> Vault : processFrontMatter(projectFile, fm => fm.github_token_key = tokenKey)
end
CM -> CM : [owner, repoName] = repo.split("/")
CM -> GH : new GitHubClient(token)\nlistReleases(owner, repoName)
activate GH
GH -> GitHub : GET /repos/{owner}/{repo}/releases
GitHub --> GH : releases[]
GH --> CM : releases
deactivate GH

CM -> CM : ensureFolder(projectFolder/releases), ensureFolder(projectFolder/commits)
loop for each release
  CM -> CM : upsertRelease(projectFolder, projectFile, rel)
  alt release file exists
    CM -> Vault : processFrontMatter(existing, fm => version, url, date, project)
  else
    CM -> CM : createNote(filePath, tag, "permanent", "project-release", {...})
    CM -> Vault : create releases/{tag}.md
  end
end

CM -> GH : compareCommits(owner, repoName, latestRelease.tag_name, defaultBranch)
activate GH
GH -> GitHub : GET /repos/.../compare/{base}...{head}
GitHub --> GH : compare result (commits[])
GH --> CM : { commits }
deactivate GH

loop for each commit
  CM -> CM : upsertCommit(projectFolder, projectFile, commit)
  alt commit file exists
    CM -> Vault : processFrontMatter(existing, fm => sha, message, url, date, released)
  else
    CM -> CM : createNote(filePath, sha, "permanent", "project-commit", {...})
    CM -> Vault : create commits/{sha}.md
  end
end

CM --> API : (void)
deactivate CM
API --> Block : (done)
deactivate API
Block -> User : Notice or UI update

@enduml
```

---

## 6. Sequence: Compile Current Draft to Materials

**Purpose**: Shows how the "Compile current draft to materials" command processes a draft file, expands wiki links, and creates a versioned materials file.

**Key steps**:
1. User runs command with a draft file active → `DraftCompiler.resolveConfig()` → finds project dashboard → reads config
2. `compileDraft()` → reads draft → processes each line:
   - `![[NoteName]]` → expands to blockquote with note content
   - `[[NoteName]]` → replaces with `[See: name]`
3. Generates versioned filename (`section_v20240204_01.md`) → writes to `materials/`
4. `updateManifest()` → updates `config/paper_manifest.json` with new materials path

**When to reference**: Debugging wiki link expansion failures, understanding version numbering, or tracing manifest updates.

```plantuml
@startuml sequence-compile-draft
!theme plain
title Sequence: Compile Current Draft to Materials

actor User
participant "Command\ncompile-current-draft" as Cmd
participant "MyPlugin" as Plugin
participant "DraftCompiler" as Compiler
participant "Vault" as Vault
participant "metadataCache" as Cache

User -> Cmd : Run "Compile current draft to materials"
Cmd -> Plugin : (callback)
Plugin -> Plugin : getActiveFile()
alt No active file or path does not include "/drafts/"
  Plugin -> User : Notice("No active file." or "Active file is not in a drafts folder.")
end
Plugin -> Compiler : new DraftCompiler(app, settings)\nresolveConfig(activeFile)
activate Compiler

Compiler -> Compiler : pathParts = draftFile.path.split("/")\ndraftsIndex = pathParts.indexOf("drafts")
alt draftsIndex < 1
  Compiler -> User : Notice("Draft file must be in a /drafts/ folder")
  Compiler --> Plugin : null
end
Compiler -> Compiler : projectFolder = pathParts.slice(0, draftsIndex).join("/")\ndashboardPath = projectFolder + "/Dashboard.md"
Compiler -> Vault : getAbstractFileByPath(dashboardPath)
alt Dashboard not found
  Compiler -> User : Notice("Dashboard not found at ...")
  Compiler --> Plugin : null
end
Compiler -> Cache : getFileCache(dashboardFile).frontmatter
Compiler --> Plugin : CompileConfig { repoRoot, materialsDir, manifestPath }
deactivate Compiler

Plugin -> Compiler : compileDraft(activeFile, cfg)
activate Compiler
Compiler -> Vault : read(draft)
Compiler -> Compiler : Split lines; skip frontmatter
loop for each body line
  Compiler -> Compiler : processWikiLinks(line)\n  - ![[x]] -> expandNote(x) -> blockquote\n  - [[x]] -> "[See: name]"
  Compiler -> Vault : getFirstLinkpathDest(noteName) for transclusion
  Compiler -> Vault : read(file) for excerpt
end
Compiler -> Compiler : getSectionBase(draft) -> sectionBase (e.g. intro)\ngetNextVersion(cfg, sectionBase, date) -> version
Compiler -> Compiler : fileName = sectionBase + "_v" + date + "_" + version + ".md"\noutputPath = repoRoot + "/materials/" + fileName
Compiler -> Vault : createFolder(materials) if needed
alt outputPath exists
  Compiler -> Vault : modify(existing, compiledContent)
else
  Compiler -> Vault : create(outputPath, compiledContent)
end
Compiler -> User : Notice("Compiled to ..." or "Compiled (updated) ...")
Compiler --> Plugin : relative path (materials/...)
deactivate Compiler

Plugin -> Compiler : updateManifest(cfg, sectionBase, outputPath)
activate Compiler
Compiler -> Vault : getAbstractFileByPath(manifestPath) e.g. config/paper_manifest.json
Compiler -> Compiler : manifest.sections[sectionId].input_source = newPath
alt manifest exists
  Compiler -> Vault : modify(manifestFile, JSON.stringify(manifest))
else
  Compiler -> Vault : createFolder(config); create(manifestPath, content)
end
Compiler --> Plugin : (void)
deactivate Compiler

@enduml
```

---

## Summary

These diagrams cover:

- **Class Diagram**: Static structure and relationships
- **Create Note**: User-initiated note creation flow
- **Dataview Execution**: How code blocks trigger scripts and call back to the plugin
- **Research Create Draft**: Quick Action flow from dashboard to vault
- **Code Refresh**: GitHub API integration and file sync
- **Compile Draft**: Wiki link expansion and materials generation

For more details on components, debugging, and call flows, see [architecture.md](architecture.md).
