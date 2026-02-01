import { App, TFile, TFolder, Notice } from "obsidian";
import {
	ObsidianNoteFactory as LibFactory,
	NoteType,
	NoteTemplateConfig,
	NoteTemplateSection,
} from "markdown-note-orm";
import { ZettelkastenSettings } from "../../types";

export class ResearchManager {
	private app: App;
	private settings: ZettelkastenSettings;

	constructor(app: App, settings: ZettelkastenSettings) {
		this.app = app;
		this.settings = settings;
	}

	/**
	 * Creates a note using markdown-note-orm with proper Zettelkasten type and subtype tag.
	 * @param filePath Full path to the note file
	 * @param title Note title
	 * @param baseType Base Zettelkasten type (fleeting, literature, atom, permanent)
	 * @param subtype Subtype tag (e.g., "research-objective")
	 * @param extraProps Additional frontmatter properties
	 * @param sections Content sections for the note body (NoteTemplateSection format)
	 */
	private async createNote(
		filePath: string,
		title: string,
		baseType: NoteType,
		subtype: string,
		extraProps: Record<string, any> = {},
		sections: NoteTemplateSection[] = [],
	): Promise<TFile> {
		const config: NoteTemplateConfig = {
			properties: {
				tags: [`type/${subtype}`],
				...extraProps,
			},
			sections: sections,
		};

		const note = await LibFactory.createByType(
			this.app,
			filePath,
			baseType,
			title,
			config,
		);
		await note.save();
		return this.app.vault.getAbstractFileByPath(filePath) as TFile;
	}

	private sanitizeSegment(input: string): string {
		return input.trim().replace(/[\\/]/g, "-");
	}

	private getRootPath(): string {
		return this.settings.researchRootPath || "Research";
	}

	private async ensureFolder(path: string): Promise<void> {
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (!existing) {
			await this.app.vault.createFolder(path);
		}
	}

	async importExistingProject(folderPath: string): Promise<TFile> {
		const dashboardPath = `${folderPath}/Dashboard.md`;
		const existing = this.app.vault.getAbstractFileByPath(dashboardPath);
		if (existing instanceof TFile) {
			return existing;
		}
		const folderName = folderPath.split("/").pop() || "Project";
		await this.ensureFolder(folderPath);
		await this.ensureFolder(`${folderPath}/objectives`);
		await this.ensureFolder(`${folderPath}/steps`);
		await this.ensureFolder(`${folderPath}/experiments`);
		await this.ensureFolder(`${folderPath}/materials`);
		await this.ensureFolder(`${folderPath}/requirements`);

		const projectId = folderName.toLowerCase().replace(/\s+/g, "_");
		const content = this.buildDashboardTemplate(projectId, folderName, folderPath);
		return await this.app.vault.create(dashboardPath, content);
	}

	async listProjects(): Promise<TFile[]> {
		const root = this.getRootPath();
		const files = this.app.vault.getAllLoadedFiles();
		return files.filter((file): file is TFile => {
			return (
				file instanceof TFile &&
				file.path.startsWith(root + "/") &&
				file.path.endsWith("/Dashboard.md")
			);
		});
	}

	listObjectives(projectFile: TFile): TFile[] {
		const projectFolder = this.getProjectFolder(projectFile);
		const files = this.app.vault.getAllLoadedFiles();
		return files.filter((file): file is TFile => {
			return (
				file instanceof TFile &&
				file.path.startsWith(projectFolder + "/objectives/") &&
				file.extension === "md"
			);
		});
	}

	async createProject(name: string): Promise<TFile> {
		const root = this.getRootPath();
		const safeName = this.sanitizeSegment(name);
		if (!safeName) throw new Error("Project name is required.");

		await this.ensureFolder(root);
		const projectFolder = `${root}/${safeName}`;
		await this.ensureFolder(projectFolder);
		await this.ensureFolder(`${projectFolder}/objectives`);
		await this.ensureFolder(`${projectFolder}/steps`);
		await this.ensureFolder(`${projectFolder}/experiments`);
		await this.ensureFolder(`${projectFolder}/materials`);
		await this.ensureFolder(`${projectFolder}/requirements`);

		const dashboardPath = `${projectFolder}/Dashboard.md`;
		const dashboardFile = this.app.vault.getAbstractFileByPath(dashboardPath);
		if (dashboardFile instanceof TFile) return dashboardFile;

		const projectId = safeName.toLowerCase().replace(/\s+/g, "_");
		const content = this.buildDashboardTemplate(projectId, safeName, projectFolder);
		return await this.app.vault.create(dashboardPath, content);
	}

	async createObjective(projectFile: TFile, title: string): Promise<TFile> {
		const projectFolder = this.getProjectFolder(projectFile);
		const folder = `${projectFolder}/objectives`;
		await this.ensureFolder(folder);
		const safeTitle = this.sanitizeSegment(title);
		const filePath = `${folder}/${safeTitle}.md`;
		if (this.app.vault.getAbstractFileByPath(filePath)) {
			throw new Error("Objective already exists.");
		}
		const blockType = this.settings.dataviewCodeBlockType || "zettelkasten-query";
		return await this.createNote(
			filePath,
			safeTitle,
			"permanent",
			"research-objective",
			{
				project: `[[${projectFile.path}|Dashboard]]`,
				title: safeTitle,
				status: "planned",
				start: "",
				end: "",
			},
			[
				{
					title: "Steps",
					level: 2,
					content: [
						"```" + blockType,
						"zk-research-objective-steps",
						`objectivePath: "${filePath}"`,
						"```",
					],
				},
			],
		);
	}

	async createRequirement(projectFile: TFile, title: string): Promise<TFile> {
		const projectFolder = this.getProjectFolder(projectFile);
		const folder = `${projectFolder}/requirements`;
		await this.ensureFolder(folder);
		const safeTitle = this.sanitizeSegment(title);
		const filePath = `${folder}/${safeTitle}.md`;
		if (this.app.vault.getAbstractFileByPath(filePath)) {
			throw new Error("Requirement already exists.");
		}
		return await this.createNote(
			filePath,
			safeTitle,
			"permanent",
			"research-requirement",
			{
				project: `[[${projectFile.path}|Dashboard]]`,
				title: safeTitle,
				status: "proposed",
				priority: "medium",
			},
		);
	}

	async createStep(projectFile: TFile, objectiveFile: TFile, title: string): Promise<TFile> {
		const projectFolder = this.getProjectFolder(projectFile);
		const folder = `${projectFolder}/steps`;
		await this.ensureFolder(folder);
		const safeTitle = this.sanitizeSegment(title);
		const filePath = `${folder}/${safeTitle}.md`;
		if (this.app.vault.getAbstractFileByPath(filePath)) {
			throw new Error("Step already exists.");
		}
		return await this.createNote(
			filePath,
			safeTitle,
			"permanent",
			"research-step",
			{
				project: `[[${projectFile.path}|Dashboard]]`,
				objective: `[[${objectiveFile.path}]]`,
				title: safeTitle,
				status: "todo",
			},
		);
	}

	async createExperiment(projectFile: TFile, title: string): Promise<TFile> {
		const projectFolder = this.getProjectFolder(projectFile);
		const folder = `${projectFolder}/experiments`;
		await this.ensureFolder(folder);
		const safeTitle = this.sanitizeSegment(title);
		const filePath = `${folder}/${safeTitle}.md`;
		if (this.app.vault.getAbstractFileByPath(filePath)) {
			throw new Error("Experiment already exists.");
		}
		return await this.createNote(
			filePath,
			safeTitle,
			"permanent",
			"research-experiment",
			{
				project: `[[${projectFile.path}|Dashboard]]`,
				title: safeTitle,
				status: "planned",
			},
		);
	}

	async openFile(file: TFile): Promise<void> {
		await this.app.workspace.getLeaf(false).openFile(file);
	}

	private getProjectFolder(projectFile: TFile): string {
		return projectFile.path.replace(/\/Dashboard\.md$/, "");
	}

	private buildDashboardTemplate(projectId: string, projectName: string, projectFolder: string): string {
		const blockType = this.settings.dataviewCodeBlockType || "zettelkasten-query";
		return [
			"---",
			"type: permanent",
			"tags:",
			"  - type/research-project",
			`project_id: ${projectId}`,
			`project_name: ${projectName}`,
			"status: active",
			"start: ",
			"end: ",
			"---",
			"",
			"# Research Command Center",
			"",
			"> **Current Goal**: ",
			"",
			"## Quick Actions",
			"",
			"```" + blockType,
			"zk-research-quick-actions",
			"```",
			"",
			"## 0. Data Pipeline Visualization",
			"",
			"```mermaid",
			"graph LR",
			"    Library[(00_Library)] -->|\"Filter by project_id\"| Dashboard{DashboardView}",
			"    Dashboard -->|\"Select and Synthesize\"| User((You))",
			"    User -->|\"Snapshot Action\"| Mat(materials/*.md)",
			"    Mat -->|\"V9.0 Script\"| PDF[FinalPDF]",
			"```",
			"",
			"## 1. AI Pipeline Tracking (Raw to Processed)",
			"",
			"```" + blockType,
			"zk-research-ai-pipeline",
			"```",
			"",
			"## 2. Atomic Intelligence (The Ingredients)",
			"",
			"```" + blockType,
			"zk-research-atomic-notes",
			"```",
			"",
			"## 3. Production Staging (The V9.0 Inputs)",
			"",
			"```" + blockType,
			"zk-research-materials",
			"```",
			"",
			"## 4. Objectives Timeline (PlantUML Gantt)",
			"",
			"```" + blockType,
			"zk-research-gantt",
			"```",
			"",
			"## 5. Objectives",
			"",
			"```" + blockType,
			"zk-research-objectives",
			"```",
			"",
			"## 6. Steps",
			"",
			"```" + blockType,
			"zk-research-steps",
			"```",
			"",
			"## 7. Experiments",
			"",
			"```" + blockType,
			"zk-research-experiments",
			"```",
			"",
			"## 8. Requirements",
			"",
			"```" + blockType,
			"zk-research-requirements",
			"```",
			"",
		].join("\n");
	}
}

