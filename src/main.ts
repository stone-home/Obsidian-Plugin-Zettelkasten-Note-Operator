import { Plugin, TFile, Notice } from 'obsidian';
import { NoteTemplateConfig } from 'markdown-note-orm';
import { ZettelkastenSettings } from "./types";
import { DEFAULT_SETTINGS } from "./constants"
import { SampleSettingTab } from "./settings";
import { NoteFactory } from "./service/factory";
import { DataviewCommand } from "./dataview/command";
import { SearchModal } from "./modals/searchModal";
import { ResearchManager } from "./service/projects/researchManager";
import { CodeProjectManager } from "./service/projects/codeProjectManager";
import { DraftCompiler } from "./service/compiler/draftCompiler";
import { PromptGenerator } from "./service/compiler/promptGenerator";

export default class MyPlugin extends Plugin {
	public settings!: ZettelkastenSettings;
	public factory!: NoteFactory;
	public dataview?: DataviewCommand;

	async onload() {
		await this.loadSettings();

		this.factory = new NoteFactory(this.app);
		await this.factory.initialize(this.settings);

		this.addSettingTab(new SampleSettingTab(this.app, this));

		this.addRibbonIcon('plus-square', 'Create New Note', () => {
			this.factory.openCreationModal();
		});

		this.addCommand({
			id: 'create-zettel-note',
			name: 'Create New Zettel Note',
			callback: () => {
				this.factory.openCreationModal();
			}
		});

		this.addCommand({
			id: 'open-zettelkasten-search',
			name: 'Open Zettelkasten Search',
			callback: () => {
				new SearchModal(this.app, this.settings, this.factory).open();
			}
		});

		this.addCommand({
			id: 'compile-current-draft',
			name: 'Compile current draft to materials',
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
			}
		});

		this.addCommand({
			id: 'generate-ai-prompt',
			name: 'Generate AI Prompt from current draft',
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
			}
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
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	onunload() {
		this.dataview?.unload();
		delete (window as any).ZettelkastenOperator;
	}

	private registerGlobalActions(): void {
		const plugin = this;
		(window as any).ZettelkastenOperator = {
			getGithubTokenKeys: async (): Promise<string[]> => {
				const storage = (plugin.app as any).secretStorage;
				if (storage && typeof storage.listSecrets === "function") {
					try {
						const ids = await storage.listSecrets();
						return Array.isArray(ids) ? ids : [];
					} catch {
						// Return empty array if listSecrets fails
					}
				}
				return [];
			},
			createResearchObjective: async (projectPath: string, title: string) => {
				const manager = new ResearchManager(plugin.app, plugin.settings);
				const file = plugin.app.vault.getAbstractFileByPath(projectPath) as TFile;
				if (!file) throw new Error("Project not found");
				return await manager.createObjective(file, title);
			},
			createResearchStep: async (
				projectPath: string,
				objectivePath: string,
				title: string,
			) => {
				const manager = new ResearchManager(plugin.app, plugin.settings);
				const projectFile = plugin.app.vault.getAbstractFileByPath(projectPath) as TFile;
				const objectiveFile = plugin.app.vault.getAbstractFileByPath(objectivePath) as TFile;
				if (!projectFile || !objectiveFile) throw new Error("Project or objective not found");
				return await manager.createStep(projectFile, objectiveFile, title);
			},
			createResearchExperiment: async (projectPath: string, title: string) => {
				const manager = new ResearchManager(plugin.app, plugin.settings);
				const file = plugin.app.vault.getAbstractFileByPath(projectPath) as TFile;
				if (!file) throw new Error("Project not found");
				return await manager.createExperiment(file, title);
			},
			createResearchDraft: async (
				projectPath: string,
				title: string,
				templateOptionIndex?: number,
			) => {
				const manager = new ResearchManager(plugin.app, plugin.settings);
				const file = plugin.app.vault.getAbstractFileByPath(projectPath) as TFile;
				if (!file) throw new Error("Project not found");
				let templateConfig: NoteTemplateConfig | undefined;
				if (
					templateOptionIndex !== undefined &&
					templateOptionIndex >= 0 &&
					plugin.settings.createNoteOptions &&
					plugin.settings.createNoteOptions[templateOptionIndex]
				) {
					templateConfig = plugin.settings.createNoteOptions[templateOptionIndex]
						.templateConfig;
				}
				return await manager.createDraft(file, title, templateConfig);
			},
			createResearchRequirement: async (projectPath: string, title: string) => {
				const manager = new ResearchManager(plugin.app, plugin.settings);
				const file = plugin.app.vault.getAbstractFileByPath(projectPath) as TFile;
				if (!file) throw new Error("Project not found");
				return await manager.createRequirement(file, title);
			},
			createCodeRequirement: async (projectPath: string, title: string) => {
				const manager = new CodeProjectManager(plugin.app, plugin.settings);
				const file = plugin.app.vault.getAbstractFileByPath(projectPath) as TFile;
				if (!file) throw new Error("Project not found");
				return await manager.createRequirement(file, title);
			},
			refreshCodeProject: async (projectPath: string, tokenKey?: string) => {
				const manager = new CodeProjectManager(plugin.app, plugin.settings);
				const file = plugin.app.vault.getAbstractFileByPath(projectPath) as TFile;
				if (!file) throw new Error("Project not found");
				return await manager.refreshProject(file, tokenKey);
			},
			updateProjectDashboardProperties: async (
				projectPath: string,
				updates: { github_token_key?: string; public_repo?: boolean },
			) => {
				const manager = new CodeProjectManager(plugin.app, plugin.settings);
				await manager.updateDashboardProperties(projectPath, updates);
			},
			updateResearchDashboardProperties: async (
				projectPath: string,
				updates: { github_token_key?: string; public_repo?: boolean; repo?: string },
			) => {
				const manager = new ResearchManager(plugin.app, plugin.settings);
				await manager.updateDashboardProperties(projectPath, updates);
			},
			getGanttStatusColors: (): Record<string, string> => {
				return { ...plugin.settings.ganttStatusColors };
			},
			getSettings: (): ZettelkastenSettings => {
				return { ...plugin.settings };
			},
			compileDraft: async (draftPath: string) => {
				const file = plugin.app.vault.getAbstractFileByPath(draftPath) as TFile;
				if (!file) throw new Error("Draft not found");
				const compiler = new DraftCompiler(plugin.app, plugin.settings);
				const cfg = await compiler.resolveConfig(file);
				if (!cfg) throw new Error("Could not resolve project config");
				return await compiler.compileDraft(file, cfg);
			},
			generateAIPrompt: async (draftFileOrPath: TFile | string) => {
				let file: TFile | null = null;
				if (typeof draftFileOrPath === "string") {
					file = plugin.app.vault.getAbstractFileByPath(draftFileOrPath) as TFile;
				} else {
					file = draftFileOrPath;
				}
				if (!file) throw new Error("Draft not found");
				const generator = new PromptGenerator(plugin.app, plugin.settings);
				return await generator.generatePrompt(file);
			},
			pushToGitHub: async (projectPath: string, tokenKey?: string) => {
				const manager = new ResearchManager(plugin.app, plugin.settings);
				const file = plugin.app.vault.getAbstractFileByPath(projectPath) as TFile;
				if (!file) throw new Error("Project not found");
				return await manager.pushToGitHub(file, tokenKey);
			},
		};
	}
}
