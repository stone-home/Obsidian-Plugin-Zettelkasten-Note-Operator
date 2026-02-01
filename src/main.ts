import { Plugin, TFile } from 'obsidian';
import { ZettelkastenSettings } from "./types";
import { DEFAULT_SETTINGS } from "./constants"
import { SampleSettingTab } from "./settings";
import { NoteFactory } from "./service/factory";
import { DataviewCommand } from "./dataview/command";
import { ResearchManager } from "./service/projects/researchManager";
import { CodeProjectManager } from "./service/projects/codeProjectManager";

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

		if (this.settings.dataviewEnabled) {
			this.dataview = new DataviewCommand(this.app, this);
			await this.dataview.initialize();
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
						// fallback if listSecrets fails
					}
				}
				const raw = plugin.settings.githubTokenKeys || "github_token";
				return raw
					.split(",")
					.map((s) => s.trim())
					.filter((s) => s.length > 0);
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
			getGanttStatusColors: (): Record<string, string> => {
				return { ...plugin.settings.ganttStatusColors };
			},
		};
	}
}
