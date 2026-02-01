import { App, Notice, TFile } from "obsidian";
import {
	ObsidianNoteFactory as LibFactory,
	NoteType,
	NoteTemplateConfig,
	NoteTemplateSection,
} from "markdown-note-orm";
import { ZettelkastenSettings } from "../../types";
import { GitHubClient } from "../github/githubClient";

export class CodeProjectManager {
	private app: App;
	private settings: ZettelkastenSettings;

	constructor(app: App, settings: ZettelkastenSettings) {
		this.app = app;
		this.settings = settings;
	}

	/**
	 * Creates a note using markdown-note-orm with proper Zettelkasten type and subtype tag.
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
		return this.settings.projectRootPath || "Projects";
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
		await this.ensureFolder(`${folderPath}/releases`);
		await this.ensureFolder(`${folderPath}/commits`);
		await this.ensureFolder(`${folderPath}/requirements`);
		const content = this.buildDashboardTemplate(folderName, folderPath);
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

	async createProject(name: string): Promise<TFile> {
		const root = this.getRootPath();
		const safeName = this.sanitizeSegment(name);
		if (!safeName) throw new Error("Project name is required.");

		await this.ensureFolder(root);
		const projectFolder = `${root}/${safeName}`;
		await this.ensureFolder(projectFolder);
		await this.ensureFolder(`${projectFolder}/releases`);
		await this.ensureFolder(`${projectFolder}/commits`);
		await this.ensureFolder(`${projectFolder}/requirements`);

		const dashboardPath = `${projectFolder}/Dashboard.md`;
		const existing = this.app.vault.getAbstractFileByPath(dashboardPath);
		if (existing instanceof TFile) return existing;

		const content = this.buildDashboardTemplate(safeName, projectFolder);
		return await this.app.vault.create(dashboardPath, content);
	}

	async createRequirement(projectFile: TFile, title: string): Promise<TFile> {
		const projectFolder = projectFile.path.replace(/\/Dashboard\.md$/, "");
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
			"code-requirement",
			{
				project: `[[${projectFile.path}|Dashboard]]`,
				title: safeTitle,
				status: "proposed",
				priority: "medium",
				release: "",
			},
		);
	}

	/**
	 * Updates frontmatter properties of a project dashboard file.
	 * Used by Quick Actions to persist github_token_key and public_repo.
	 */
	async updateDashboardProperties(
		filePath: string,
		updates: { github_token_key?: string; public_repo?: boolean },
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

	private buildDashboardTemplate(projectName: string, projectFolder: string): string {
		const blockType = this.settings.dataviewCodeBlockType || "zettelkasten-query";
		return [
			"---",
			"type: permanent",
			"tags:",
			"  - type/code-project",
			`project_name: ${projectName}`,
			"repo: owner/name",
			"defaultBranch: trunk",
			"github_token_key: github_token",
			"public_repo: false",
			"---",
			"",
			"# Code Project Dashboard",
			"",
			"## Quick Actions",
			"",
			"```" + blockType,
			"zk-project-quick-actions",
			"```",
			"",
			"## Requirements",
			"",
			"```" + blockType,
			"zk-project-requirements",
			"```",
			"",
			"## Releases",
			"",
			"```" + blockType,
			"zk-project-releases",
			"```",
			"",
			"## Unreleased Commits",
			"",
			"```" + blockType,
			"zk-project-commits",
			"```",
			"",
		].join("\n");
	}

	async refreshProject(projectFile: TFile, tokenKey?: string): Promise<void> {
		const cache = this.app.metadataCache.getFileCache(projectFile)?.frontmatter || {};
		const repo: string = cache.repo;
		const defaultBranch: string = cache.defaultBranch || "trunk";
		if (!repo || !repo.includes("/")) {
			new Notice("Missing repo field (owner/name) in project dashboard.");
			return;
		}

		const resolvedKey = tokenKey || cache.github_token_key || "github_token";
		let token: string | null = null;
		if (!resolvedKey || resolvedKey === "(public)") {
			token = "";
		} else {
			const storage = (this.app as any).secretStorage;
			if (!storage || typeof storage.getSecret !== "function") {
				new Notice("SecretStorage is not available in this Obsidian version.");
				return;
			}
			token = await storage.getSecret(resolvedKey);
			if (!token) {
				token = "";
			}
		}
		if (tokenKey && tokenKey !== cache.github_token_key) {
			await this.app.fileManager.processFrontMatter(projectFile, (fm) => {
				fm.github_token_key = tokenKey;
			});
		}

		const [owner, repoName] = repo.split("/");
		const client = new GitHubClient(token || "");
		const releases = await client.listReleases(owner, repoName);

		const projectFolder = projectFile.path.replace(/\/Dashboard\.md$/, "");
		await this.ensureFolder(`${projectFolder}/releases`);
		await this.ensureFolder(`${projectFolder}/commits`);

		const latestRelease = releases[0];
		for (const rel of releases) {
			await this.upsertRelease(projectFolder, projectFile, rel);
		}

		if (latestRelease?.tag_name) {
			const compare = await client.compareCommits(
				owner,
				repoName,
				latestRelease.tag_name,
				defaultBranch,
			);
			const commits = compare?.commits || [];
			for (const commit of commits) {
				await this.upsertCommit(projectFolder, projectFile, commit);
			}
		}
	}

	private async upsertRelease(
		projectFolder: string,
		projectFile: TFile,
		release: any,
	): Promise<void> {
		const tag = release.tag_name;
		if (!tag) return;
		const filePath = `${projectFolder}/releases/${tag}.md`;
		const content = [
			"---",
			"type: permanent",
			"tags:",
			"  - type/project-release",
			`project: "[[${projectFile.path}|Dashboard]]"`,
			`version: ${tag}`,
			`url: ${release.html_url || ""}`,
			`date: ${release.published_at || ""}`,
			"---",
			"",
			`# ${tag}`,
			"",
			`${release.body || ""}`,
			"",
		].join("\n");
		await this.upsertFile(filePath, content);
	}

	private async upsertCommit(
		projectFolder: string,
		projectFile: TFile,
		commit: any,
	): Promise<void> {
		const sha = commit.sha?.substring(0, 7);
		if (!sha) return;
		const filePath = `${projectFolder}/commits/${sha}.md`;
		const message = commit.commit?.message?.split("\n")[0] || "";
		const content = [
			"---",
			"type: permanent",
			"tags:",
			"  - type/project-commit",
			`project: "[[${projectFile.path}|Dashboard]]"`,
			`sha: ${sha}`,
			`message: ${message.replace(/:/g, "")}`,
			`url: ${commit.html_url || ""}`,
			`date: ${commit.commit?.author?.date || ""}`,
			"released: false",
			"---",
			"",
			`# ${sha}`,
			"",
			message,
			"",
		].join("\n");
		await this.upsertFile(filePath, content);
	}

	private async upsertFile(path: string, content: string): Promise<void> {
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) {
			await this.app.vault.modify(existing, content);
		} else {
			await this.app.vault.create(path, content);
		}
	}

	async openFile(file: TFile): Promise<void> {
		await this.app.workspace.getLeaf(false).openFile(file);
	}
}

