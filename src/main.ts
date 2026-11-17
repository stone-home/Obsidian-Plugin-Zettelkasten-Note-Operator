import { Plugin, TFile, TFolder, Notice } from "obsidian";
import { NoteTemplateConfig } from "markdown-note-orm";
import { GithubPullRule, ZettelkastenSettings } from "./types";
import { DEFAULT_SETTINGS } from "./constants";
import { SampleSettingTab } from "./settings";
import { NoteFactory } from "./service/factory";
import { DataviewCommand } from "./dataview/command";
import { SearchModal } from "./modals/searchModal";
import {
	ResearchManager,
	type LastPushRequestDebug,
} from "./service/projects/researchManager";
import { CodeProjectManager } from "./service/projects/codeProjectManager";
import { askLegacyCommitCleanup } from "./modals/codeProjectsModal";
import { DraftCompiler } from "./service/compiler/draftCompiler";
import { PromptGenerator } from "./service/compiler/promptGenerator";

/** The `window.ZettelkastenOperator` API that Dataview scripts call. */
type ZettelkastenOperatorApi = ReturnType<MyPlugin["createGlobalApi"]>;

declare global {
	interface Window {
		ZettelkastenOperator?: ZettelkastenOperatorApi;
	}
}

export default class MyPlugin extends Plugin {
	public settings!: ZettelkastenSettings;
	public factory!: NoteFactory;
	public dataview?: DataviewCommand;
	/** Last Push to GitHub request debug (headers/body/params) for Research Quick Actions. */
	public lastPushRequestDebug?: LastPushRequestDebug;

	async onload() {
		await this.loadSettings();

		this.factory = new NoteFactory(this.app);
		await this.factory.initialize(this.settings);

		this.addSettingTab(new SampleSettingTab(this.app, this));

		this.addRibbonIcon("plus-square", "Create New Note", () => {
			this.factory.openCreationModal();
		});

		this.addCommand({
			id: "create-zettel-note",
			name: "Create New Zettel Note",
			callback: () => {
				this.factory.openCreationModal();
			},
		});

		this.addCommand({
			id: "open-zettelkasten-search",
			name: "Open Zettelkasten Search",
			callback: () => {
				new SearchModal(this.app, this.settings, this.factory).open();
			},
		});

		this.addCommand({
			id: "compile-current-draft",
			name: "Compile current draft to materials",
			callback: async () => {
				const activeFile = this.app.workspace.getActiveFile();
				if (!activeFile) {
					new Notice("No active file.");
					return;
				}
				if (!activeFile.path.includes("/drafts/")) {
					new Notice("Active file is not in a drafts folder.");
					return;
				}
				const compiler = new DraftCompiler(this.app, this.settings);
				const cfg = await compiler.resolveConfig(activeFile);
				if (!cfg) return;
				const outputPath = await compiler.compileDraft(activeFile, cfg);
				const sectionBase = activeFile.basename.replace("logic_", "");
				await compiler.updateManifest(cfg, sectionBase, outputPath);
			},
		});

		this.addCommand({
			id: "generate-ai-prompt",
			name: "Generate AI Prompt from current draft",
			callback: async () => {
				const activeFile = this.app.workspace.getActiveFile();
				if (!activeFile) {
					new Notice("No active file.");
					return;
				}
				if (!activeFile.path.includes("/drafts/")) {
					new Notice("Active file is not in a drafts folder.");
					return;
				}
				const generator = new PromptGenerator(this.app, this.settings);
				await generator.generatePrompt(activeFile);
			},
		});

		// Create dataview instance immediately when enabled so settings/refresh never create a second one (avoids "already registered").
		if (this.settings.dataviewEnabled) {
			this.dataview = new DataviewCommand(this.app, this);
			this.app.workspace.onLayoutReady(async () => {
				await this.dataview!.initialize();
			});
		}

		this.registerGlobalActions();
	}

	async loadSettings() {
		const saved = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
		// AI prompt rules are only set to default when user clicks "Reset rules to defaults" in settings
		if (this.settings.aiPromptMaxDepth === undefined) {
			this.settings.aiPromptMaxDepth = DEFAULT_SETTINGS.aiPromptMaxDepth ?? 1;
		}
		if (this.settings.aiPromptMaxCharsPerNote === undefined) {
			this.settings.aiPromptMaxCharsPerNote =
				DEFAULT_SETTINGS.aiPromptMaxCharsPerNote ?? 4000;
		}
		if (!this.settings.aiPromptWrapperStyle) {
			this.settings.aiPromptWrapperStyle =
				DEFAULT_SETTINGS.aiPromptWrapperStyle ?? "xml";
		}
		// Migrate: summaryHeader -> summaryHeaders for existing rules
		if (this.settings.aiPromptRules?.length) {
			for (const rule of this.settings.aiPromptRules) {
				if (
					rule.summaryHeader &&
					(!rule.summaryHeaders || rule.summaryHeaders.length === 0)
				) {
					rule.summaryHeaders = [rule.summaryHeader];
				}
			}
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	onunload() {
		this.dataview?.unload();
		delete window.ZettelkastenOperator;
	}

	private registerGlobalActions(): void {
		window.ZettelkastenOperator = this.createGlobalApi();
	}

	/**
	 * Looks up a vault path for the global API.
	 * @returns The file at `path`, or null when nothing or a folder is there.
	 */
	private getFileByPath(path: string): TFile | null {
		const file = this.app.vault.getAbstractFileByPath(path);
		return file instanceof TFile ? file : null;
	}

	/**
	 * Looks up a vault path for the global API methods that accept a file or a folder:
	 * the create methods' project and objective paths, and pushToGitHub's project path.
	 * @returns The file or folder at `path`, or null when nothing is there.
	 */
	private getFileOrFolderByPath(path: string): TFile | TFolder | null {
		const entry = this.app.vault.getAbstractFileByPath(path);
		return entry instanceof TFile || entry instanceof TFolder ? entry : null;
	}

	private createGlobalApi() {
		return {
			getGithubTokenKeys: async (): Promise<string[]> => {
				// secretStorage is missing from the obsidian typings this plugin builds against.
				const storage: unknown =
					"secretStorage" in this.app ? this.app.secretStorage : undefined;
				if (hasListSecrets(storage)) {
					try {
						const ids: unknown = await storage.listSecrets();
						return Array.isArray(ids)
							? ids.filter((id): id is string => typeof id === "string")
							: [];
					} catch {
						// Return empty array if listSecrets fails
					}
				}
				return [];
			},
			createResearchObjective: async (projectPath: string, title: string) => {
				const manager = new ResearchManager(this.app, this.settings);
				const file = this.getFileOrFolderByPath(projectPath);
				if (!file) throw new Error("Project not found");
				return await manager.createObjective(file, title);
			},
			createResearchStep: async (
				projectPath: string,
				objectivePath: string,
				title: string
			) => {
				const manager = new ResearchManager(this.app, this.settings);
				const projectFile = this.getFileOrFolderByPath(projectPath);
				const objectiveFile = this.getFileOrFolderByPath(objectivePath);
				if (!projectFile || !objectiveFile)
					throw new Error("Project or objective not found");
				return await manager.createStep(projectFile, objectiveFile, title);
			},
			createResearchExperiment: async (projectPath: string, title: string) => {
				const manager = new ResearchManager(this.app, this.settings);
				const file = this.getFileOrFolderByPath(projectPath);
				if (!file) throw new Error("Project not found");
				return await manager.createExperiment(file, title);
			},
			createResearchDraft: async (
				projectPath: string,
				title: string,
				templateOptionIndex?: number
			) => {
				const manager = new ResearchManager(this.app, this.settings);
				const file = this.getFileOrFolderByPath(projectPath);
				if (!file) throw new Error("Project not found");
				let templateConfig: NoteTemplateConfig | undefined;
				if (
					templateOptionIndex !== undefined &&
					templateOptionIndex >= 0 &&
					this.settings.createNoteOptions &&
					this.settings.createNoteOptions[templateOptionIndex]
				) {
					templateConfig =
						this.settings.createNoteOptions[templateOptionIndex]
							.templateConfig;
				}
				return await manager.createDraft(file, title, templateConfig);
			},
			createResearchRequirement: async (projectPath: string, title: string) => {
				const manager = new ResearchManager(this.app, this.settings);
				const file = this.getFileOrFolderByPath(projectPath);
				if (!file) throw new Error("Project not found");
				return await manager.createRequirement(file, title);
			},
			createCodeRequirement: async (projectPath: string, title: string) => {
				const manager = new CodeProjectManager(this.app, this.settings);
				const file = this.getFileOrFolderByPath(projectPath);
				if (!file) throw new Error("Project not found");
				return await manager.createRequirement(file, title);
			},
			refreshCodeProject: async (projectPath: string, tokenKey?: string) => {
				const manager = new CodeProjectManager(this.app, this.settings);
				const file = this.getFileByPath(projectPath);
				if (!file) throw new Error("Project not found");
				return await manager.refreshProject(file, tokenKey, {
					confirmLegacyCleanup: (count) =>
						askLegacyCommitCleanup(this.app, count),
				});
			},
			updateProjectDashboardProperties: async (
				projectPath: string,
				updates: { github_token_key?: string; public_repo?: boolean }
			) => {
				const manager = new CodeProjectManager(this.app, this.settings);
				await manager.updateDashboardProperties(projectPath, updates);
			},
			updateResearchDashboardProperties: async (
				projectPath: string,
				updates: {
					github_token_key?: string;
					public_repo?: boolean;
					repo?: string;
					defaultBranch?: string;
					github_target_folder?: string;
				}
			) => {
				const manager = new ResearchManager(this.app, this.settings);
				await manager.updateDashboardProperties(projectPath, updates);
			},
			getGanttStatusColors: (): Record<string, string> => {
				return { ...this.settings.ganttStatusColors };
			},
			getSettings: (): ZettelkastenSettings => {
				return { ...this.settings };
			},
			getLastPushRequestDebug: (): LastPushRequestDebug | null => {
				return this.lastPushRequestDebug ?? null;
			},
			compileDraft: async (draftPath: string) => {
				const file = this.getFileByPath(draftPath);
				if (!file) throw new Error("Draft not found");
				const compiler = new DraftCompiler(this.app, this.settings);
				const cfg = await compiler.resolveConfig(file);
				if (!cfg) throw new Error("Could not resolve project config");
				return await compiler.compileDraft(file, cfg);
			},
			generateAIPrompt: async (draftFileOrPath: TFile | string) => {
				let file: TFile | null = null;
				if (typeof draftFileOrPath === "string") {
					file = this.getFileByPath(draftFileOrPath);
				} else {
					file = draftFileOrPath;
				}
				if (!file) throw new Error("Draft not found");
				const generator = new PromptGenerator(this.app, this.settings);
				return await generator.generatePrompt(file);
			},
			pushToGitHub: async (projectPath: string, tokenKey?: string) => {
				const manager = new ResearchManager(this.app, this.settings);
				const file = this.getFileOrFolderByPath(projectPath);
				if (!file) throw new Error("Project not found");
				const result = await manager.pushToGitHub(file, tokenKey);
				if (result?.lastRequestDebug)
					this.lastPushRequestDebug = result.lastRequestDebug;
				return result;
			},
			getPullRules: (): GithubPullRule[] => this.settings.githubPullRules ?? [],
			setResearchPullRules: async (projectPath: string, ids: string[]) => {
				const manager = new ResearchManager(this.app, this.settings);
				const file = this.getFileByPath(projectPath);
				if (!file) throw new Error("Project not found");
				await manager.setPullRules(file, ids);
			},
			pullFromGitHub: async (projectPath: string, tokenKey?: string) => {
				const manager = new ResearchManager(this.app, this.settings);
				const file = this.getFileByPath(projectPath);
				if (!file) throw new Error("Project not found");
				return await manager.pullFromGitHub(file, tokenKey);
			},
			renderDraftsTable: (container: HTMLElement, projectPath: string) => {
				const manager = new ResearchManager(this.app, this.settings);
				manager.renderDraftsTable(container, projectPath, {
					generateAIPrompt: async (draftPath: string) => {
						const file = this.getFileByPath(draftPath);
						if (!file) throw new Error("Draft not found");
						const generator = new PromptGenerator(this.app, this.settings);
						return await generator.generatePrompt(file);
					},
					pushToGitHub: async (projPath: string, tokenKey?: string) => {
						const rm = new ResearchManager(this.app, this.settings);
						const file = this.getFileByPath(projPath);
						if (!file) throw new Error("Project not found");
						const result = await rm.pushToGitHub(file, tokenKey);
						if (result?.lastRequestDebug)
							this.lastPushRequestDebug = result.lastRequestDebug;
					},
				});
			},
		};
	}
}

/** True when `value` is an object or function with a callable `listSecrets` member. */
function hasListSecrets(value: unknown): value is { listSecrets: () => unknown } {
	return (
		(typeof value === "object" || typeof value === "function") &&
		value !== null &&
		"listSecrets" in value &&
		typeof value.listSecrets === "function"
	);
}
