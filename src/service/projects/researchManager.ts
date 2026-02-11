import { App, TFile, TFolder, Notice, requestUrl } from "obsidian";
import {
	ObsidianNoteFactory as LibFactory,
	NoteType,
	NoteTemplateConfig,
	NoteTemplateSection,
} from "markdown-note-orm";
import { ZettelkastenSettings } from "../../types";
import { Logger } from "../../logger";
import { stripMdExtension } from "../../utils/path";

export class ResearchManager {
	private app: App;
	private settings: ZettelkastenSettings;
	private logger = Logger.createLogger("ResearchManager");

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

	/**
	 * Render drafts table into container: one row per draft with file name, Generate AI Prompt, and Push to GitHub.
	 * Callbacks are provided by the global API (generateAIPrompt, pushToGitHub).
	 */
	renderDraftsTable(
		container: HTMLElement,
		projectPath: string,
		callbacks: {
			generateAIPrompt: (draftPath: string) => Promise<string>;
			pushToGitHub: (projectPath: string, tokenKey?: string) => Promise<void>;
		},
	): void {
		const projectFolder = projectPath.replace(/\/Dashboard\.md$/i, "") || projectPath;
		const draftsPath = `${projectFolder}/drafts`;
		const draftsFolder = this.app.vault.getAbstractFileByPath(draftsPath);

		const section = container.createDiv({ cls: "zk-pqa-group" });
		section.style.cssText = "display:flex; flex-direction:column; gap:8px; width:100%;";
		section.createSpan({ text: "Drafts", cls: "zk-pqa-label" });

		if (!draftsFolder || !(draftsFolder instanceof TFolder)) {
			section.createSpan({ text: "No drafts folder found.", cls: "zk-pqa-desc" });
			return;
		}

		const drafts = draftsFolder.children.filter(
			(f): f is TFile => f instanceof TFile && f.extension === "md",
		);

		for (const draft of drafts) {
			const row = section.createDiv({ cls: "zk-pqa-draft-row" });
			row.style.cssText = "display:flex; align-items:center; gap:8px; width:100%;";

			const link = row.createEl("a", { href: draft.path, cls: "zk-pqa-draft-link" });
			link.setAttribute("data-href", draft.path);
			link.textContent = draft.basename;
			link.style.flex = "1";
			(link as any).onclick = (e: MouseEvent) => {
				e.preventDefault();
				this.app.workspace.getLeaf().openFile(draft);
			};

			const genBtn = row.createEl("button", { text: "Generate AI Prompt", cls: "zk-pqa-btn zk-pqa-btn-primary" });
			genBtn.type = "button";
			genBtn.addEventListener("click", async (e) => {
				e.preventDefault();
				e.stopPropagation();
				try {
					await callbacks.generateAIPrompt(draft.path);
					new Notice("AI Prompt generated");
				} catch (err) {
					new Notice(err instanceof Error ? err.message : "Failed to generate prompt");
				}
			});

			const pushBtn = row.createEl("button", { text: "Push to GitHub", cls: "zk-pqa-btn zk-pqa-btn-primary" });
			pushBtn.type = "button";
			pushBtn.addEventListener("click", async (e) => {
				e.preventDefault();
				e.stopPropagation();
				try {
					await callbacks.pushToGitHub(projectPath);
					new Notice("Pushed to GitHub");
				} catch (err) {
					new Notice(err instanceof Error ? err.message : "Failed to push");
				}
			});
		}
	}

	private async ensureFolder(path: string): Promise<void> {
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (!existing) {
			try {
				await this.app.vault.createFolder(path);
			} catch {
				// Folder may already exist due to race condition, ignore
			}
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
		await this.ensureFolder(`${folderPath}/drafts`);

		const projectId = folderName.toLowerCase().replace(/\s+/g, "_");
		return await this.createDashboard(dashboardPath, projectId, folderName, folderPath);
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
		await this.ensureFolder(`${projectFolder}/drafts`);

		const dashboardPath = `${projectFolder}/Dashboard.md`;
		const dashboardFile = this.app.vault.getAbstractFileByPath(dashboardPath);
		if (dashboardFile instanceof TFile) return dashboardFile;

		const projectId = safeName.toLowerCase().replace(/\s+/g, "_");
		return await this.createDashboard(dashboardPath, projectId, safeName, projectFolder);
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
				project: `[[${stripMdExtension(projectFile.path)}|Dashboard]]`,
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
				project: `[[${stripMdExtension(projectFile.path)}|Dashboard]]`,
				title: safeTitle,
				status: "proposed",
				priority: "medium",
			},
		);
	}

	/**
	 * Create a draft note in the project's drafts folder (for AI pipeline / writing).
	 * @param templateConfig Optional template configuration to apply to the draft
	 */
	async createDraft(
		projectFile: TFile,
		title: string,
		templateConfig?: NoteTemplateConfig,
	): Promise<TFile> {
		const projectFolder = this.getProjectFolder(projectFile);
		const folder = `${projectFolder}/drafts`;
		await this.ensureFolder(folder);
		const safeTitle = this.sanitizeSegment(title);
		const filePath = `${folder}/${safeTitle}.md`;
		if (this.app.vault.getAbstractFileByPath(filePath)) {
			throw new Error("Draft with this title already exists.");
		}
		const baseProps = {
			project: `[[${stripMdExtension(projectFile.path)}|Dashboard]]`,
			title: safeTitle,
			section_title: safeTitle,
			status: "draft",
		};
		// Merge template config properties if provided
		const finalProps = templateConfig?.properties
			? { ...baseProps, ...templateConfig.properties }
			: baseProps;
		const finalSections = templateConfig?.sections || [];
		return await this.createNote(
			filePath,
			safeTitle,
			"fleeting",
			"research-draft",
			finalProps,
			finalSections,
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
				project: `[[${stripMdExtension(projectFile.path)}|Dashboard]]`,
				objective: `[[${stripMdExtension(objectiveFile.path)}]]`,
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
				project: `[[${stripMdExtension(projectFile.path)}|Dashboard]]`,
				title: safeTitle,
				status: "planned",
			},
		);
	}

	async openFile(file: TFile): Promise<void> {
		await this.app.workspace.getLeaf(false).openFile(file);
	}

	/**
	 * Updates frontmatter properties of a research project dashboard file.
	 * Used by Quick Actions to persist github_token_key, public_repo, and repo.
	 */
	async updateDashboardProperties(
		filePath: string,
		updates: { github_token_key?: string; public_repo?: boolean; repo?: string },
	): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(filePath) as TFile;
		if (!file) return;
		const content = await this.app.vault.read(file);
		const fmRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
		const match = content.match(fmRegex);
		if (!match) return;
		const fmBlock = match[1];
		const rest = content.slice(match[0].length);
		const keysToUpdate = new Set(Object.keys(updates) as (keyof typeof updates)[]);
		const lines = fmBlock.split(/\r?\n/);
		const updated = new Set<string>();
		const newLines: string[] = [];
		for (const line of lines) {
			const keyMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
			if (keyMatch && keysToUpdate.has(keyMatch[1] as keyof typeof updates)) {
				const key = keyMatch[1] as keyof typeof updates;
				updated.add(key);
				const val = updates[key];
				if (val !== undefined) {
					newLines.push(
						typeof val === "boolean" ? `${key}: ${val}` : `${key}: ${String(val)}`,
					);
				} else {
					newLines.push(line);
				}
			} else {
				newLines.push(line);
			}
		}
		for (const key of keysToUpdate) {
			if (!updated.has(key)) {
				const val = updates[key as keyof typeof updates];
				if (val !== undefined) {
					newLines.push(
						typeof val === "boolean"
							? `${key}: ${val}`
							: `${key}: ${String(val)}`,
					);
				}
			}
		}
		const newContent = "---\n" + newLines.join("\n") + "\n---\n" + rest;
		await this.app.vault.modify(file, newContent);
	}

	/**
	 * Push prompts folder contents to GitHub repository.
	 * Uses GitHub Contents API to upload/update files.
	 */
	async pushToGitHub(projectFile: TFile, tokenKey?: string): Promise<void> {
		const projectFolder = this.getProjectFolder(projectFile);
		const promptsFolder = `${projectFolder}/prompts`;

		// Read dashboard frontmatter to get repo info
		const cache = this.app.metadataCache.getFileCache(projectFile);
		const fm = cache?.frontmatter || {};
		const repo = fm.repo;
		const defaultBranch = fm.defaultBranch || "main";
		const isPublic = fm.public_repo === true;

		if (!repo) {
			new Notice("No GitHub repo configured. Set 'repo' in dashboard frontmatter.");
			return;
		}

		// Get token if needed
		let token: string | null = null;
		if (!isPublic && tokenKey) {
			const storage = (this.app as any).secretStorage;
			if (storage && typeof storage.getSecret === "function") {
				try {
					token = await storage.getSecret(tokenKey);
				} catch {
					this.logger.warn("Failed to get token from SecretStorage");
				}
			}
		}

		// Get files in prompts folder
		const promptsDir = this.app.vault.getAbstractFileByPath(promptsFolder);
		if (!promptsDir || !(promptsDir instanceof TFolder)) {
			new Notice(`Prompts folder not found: ${promptsFolder}. Generate AI prompts first.`);
			return;
		}

		const files = promptsDir.children.filter(
			(f): f is TFile => f instanceof TFile && f.extension === "md"
		);

		if (files.length === 0) {
			new Notice("No prompts to push. Generate AI prompts first.");
			return;
		}

		const headers: Record<string, string> = {
			"Accept": "application/vnd.github+json",
			"X-GitHub-Api-Version": "2022-11-28",
		};
		if (token) {
			headers["Authorization"] = `Bearer ${token}`;
		}

		let successCount = 0;
		let errorCount = 0;

		for (const file of files) {
			try {
				const content = await this.app.vault.read(file);
				const base64Content = btoa(unescape(encodeURIComponent(content)));
				const path = `prompts/${file.name}`;

				// Check if file exists (to get SHA for updates)
				let sha: string | undefined;
				try {
					const existingResp = await requestUrl({
						url: `https://api.github.com/repos/${repo}/contents/${path}?ref=${defaultBranch}`,
						method: "GET",
						headers,
					});
					sha = existingResp.json?.sha;
				} catch {
					// File doesn't exist, that's fine
				}

				// Create or update file
				await requestUrl({
					url: `https://api.github.com/repos/${repo}/contents/${path}`,
					method: "PUT",
					headers: {
						...headers,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						message: `Update ${file.name} from Obsidian`,
						content: base64Content,
						branch: defaultBranch,
						...(sha ? { sha } : {}),
					}),
				});

				successCount++;
				this.logger.info(`Pushed prompt ${file.name} to GitHub`);
			} catch (error) {
				errorCount++;
				this.logger.logError(`Failed to push ${file.name}:`, error);
			}
		}

		if (errorCount > 0) {
			new Notice(`Pushed ${successCount} files, ${errorCount} failed.`);
		} else {
			new Notice(`Successfully pushed ${successCount} files to GitHub.`);
		}
	}

	private getProjectFolder(projectFile: TFile): string {
		return projectFile.path.replace(/\/Dashboard\.md$/, "");
	}

	/**
	 * Creates a research project dashboard using createNote() for unified entry.
	 */
	private async createDashboard(
		filePath: string,
		projectId: string,
		projectName: string,
		projectFolder: string,
	): Promise<TFile> {
		const blockType = this.settings.dataviewCodeBlockType || "zettelkasten-query";
		return await this.createNote(
			filePath,
			"Research Command Center",
			"permanent",
			"research-project",
			{
				project_id: projectId,
				project_name: projectName,
				status: "active",
				start: "",
				end: "",
				repo: "",
				defaultBranch: "main",
				github_token_key: "",
				public_repo: true,
			},
			[
				{
					title: "",
					level: 0,
					content: ["> **Current Goal**: "],
				},
				{
					title: "Quick Actions",
					level: 2,
					content: [
						"```" + blockType,
						"zk-research-quick-actions",
						"```",
					],
				},
				{
					title: "0. Data Pipeline Visualization",
					level: 2,
					content: [
						"```mermaid",
						"graph LR",
						"    subgraph KB [Knowledge Base]",
						"        Lit[Literature]",
						"        Atom[Atom]",
						"        Perm[Permanent]",
						"        Lex[Lexicon]",
						"        Hub[Hubs]",
						"    end",
						"    KB -->|Wiki Links| Draft[drafts/*.md]",
						"    Draft -->|Compile| Mat[materials/*.md]",
						"    Mat -->|Push| GH[GitHub Repo]",
						"    GH -->|AI Generation| LaTeX[sections/*.tex]",
						"```",
					],
				},
				{
					title: "1. AI Pipeline Tracking (Draft Status)",
					level: 2,
					content: [
						"```" + blockType,
						"zk-research-ai-pipeline-tracking",
						"```",
					],
				},
				{
					title: "2. Atomic Intelligence (The Ingredients)",
					level: 2,
					content: [
						"```" + blockType,
						"zk-research-ai-pipeline",
						"```",
						"",
						"```" + blockType,
						"zk-research-atomic-notes",
						"```",
					],
				},
				{
					title: "3. Production Staging (The V9.0 Inputs)",
					level: 2,
					content: [
						"```" + blockType,
						"zk-research-materials",
						"```",
					],
				},
				{
					title: "4. Objectives Timeline (PlantUML Gantt)",
					level: 2,
					content: [
						"```" + blockType,
						"zk-research-gantt",
						"```",
					],
				},
				{
					title: "5. Objectives",
					level: 2,
					content: [
						"```" + blockType,
						"zk-research-objectives",
						"```",
					],
				},
				{
					title: "6. Steps",
					level: 2,
					content: [
						"```" + blockType,
						"zk-research-steps",
						"```",
					],
				},
				{
					title: "7. Experiments",
					level: 2,
					content: [
						"```" + blockType,
						"zk-research-experiments",
						"```",
					],
				},
			],
		);
	}
}

