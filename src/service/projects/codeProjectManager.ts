import { App, Notice, TFile, stringifyYaml } from "obsidian";
import {
	ObsidianNoteFactory as LibFactory,
	NoteType,
	NoteTemplateConfig,
	NoteTemplateSection,
} from "markdown-note-orm";
import { ZettelkastenSettings } from "../../types";
import { GitHubClient } from "../github/githubClient";
import { describeGitHubError } from "../github/errors";
import { stripMdExtension } from "../../utils/path";

export interface RefreshSummary {
	releases: number;
	unreleasedCommits: number;
	/** Old per-commit notes still under `<project>/commits/` after this refresh. */
	legacyCommitNotes: number;
}

export interface RefreshOptions {
	/** Asked (after the new note is written) whether old per-commit notes may be trashed. */
	confirmLegacyCleanup?: (count: number) => Promise<boolean>;
}

export interface UnreleasedCommit {
	sha: string;
	message: string;
	date: string;
	url: string;
}

export const UNRELEASED_COMMITS_NOTE = "Unreleased Commits";

/**
 * Builds the whole `Unreleased Commits` note: the commits as frontmatter (read by the
 * zk-project-commits script) plus a readable table. The note is rewritten on every refresh.
 */
export function buildUnreleasedCommitsNote(input: {
	project: string;
	base: string | null;
	refreshed: string;
	totalCommits: number;
	truncated: boolean;
	commits: UnreleasedCommit[];
	/** Set when the comparison failed; the note then says so instead of "no unreleased commits". */
	error?: string;
}): string {
	const frontmatter = {
		type: "permanent",
		tags: ["type/project-unreleased"],
		project: input.project,
		base: input.base,
		refreshed: input.refreshed,
		total_commits: input.totalCommits,
		truncated: input.truncated,
		commits: input.commits,
		...(input.error ? { error: input.error } : {}),
	};
	const yaml = stringifyYaml(frontmatter);
	const cell = (text: string) => text.replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
	const lines = [`# ${UNRELEASED_COMMITS_NOTE}`, ""];
	if (input.base === null) {
		lines.push("No release yet, so there is nothing to compare. Rewritten on every Refresh.");
	} else {
		lines.push(`Commits after ${input.base} on the default branch. Rewritten on every Refresh.`);
		if (input.truncated) {
			lines.push("", `GitHub returned ${input.commits.length} of ${input.totalCommits} commits.`);
		}
	}
	lines.push("");
	if (input.error) {
		lines.push(`Could not load the unreleased commits: ${input.error}`);
	} else if (input.commits.length === 0) {
		lines.push("No unreleased commits.");
	} else {
		lines.push("| sha | message | date | url |", "| --- | --- | --- | --- |");
		for (const c of input.commits) {
			lines.push(`| ${cell(c.sha.substring(0, 7))} | ${cell(c.message)} | ${cell(c.date)} | ${c.url ? `[open](${c.url})` : ""} |`);
		}
	}
	return `---\n${yaml.endsWith("\n") ? yaml : yaml + "\n"}---\n${lines.join("\n")}\n`;
}

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
		// createByType seeds type defaults (e.g. url: "") and keeps them when applying the
		// template, so values passed here would be dropped. Set them explicitly.
		for (const [key, value] of Object.entries(extraProps)) {
			note.properties.set(key, value);
		}
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
		await this.ensureFolder(`${folderPath}/releases`);
		await this.ensureFolder(`${folderPath}/requirements`);
		return await this.createDashboard(dashboardPath, folderName);
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
		await this.ensureFolder(`${projectFolder}/requirements`);

		const dashboardPath = `${projectFolder}/Dashboard.md`;
		const existing = this.app.vault.getAbstractFileByPath(dashboardPath);
		if (existing instanceof TFile) return existing;

		return await this.createDashboard(dashboardPath, safeName);
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
				project: `[[${stripMdExtension(projectFile.path)}|Dashboard]]`,
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

	/**
	 * Creates a code project dashboard using createNote() for unified entry.
	 */
	private async createDashboard(filePath: string, projectName: string): Promise<TFile> {
		const blockType = this.settings.dataviewCodeBlockType || "zettelkasten-query";
		return await this.createNote(
			filePath,
			"Code Project Dashboard",
			"permanent",
			"code-project",
			{
				project_name: projectName,
				repo: "owner/name",
				defaultBranch: "trunk",
				github_token_key: "",
				public_repo: true,
			},
			[
				{
					title: "Quick Actions",
					level: 2,
					content: [
						"```" + blockType,
						"zk-project-quick-actions",
						"```",
					],
				},
				{
					title: "Requirements",
					level: 2,
					content: [
						"```" + blockType,
						"zk-project-requirements",
						"```",
					],
				},
				{
					title: "Releases",
					level: 2,
					content: [
						"```" + blockType,
						"zk-project-releases",
						"```",
					],
				},
				{
					title: "Unreleased Commits",
					level: 2,
					content: [
						"```" + blockType,
						"zk-project-commits",
						"```",
					],
				},
			],
		);
	}

	/**
	 * Syncs releases and unreleased commits from GitHub into the project folder.
	 * Throws an Error with a user-facing message when the dashboard, the PAT or a
	 * GitHub request is the problem; callers show it as a Notice.
	 */
	async refreshProject(
		projectFile: TFile,
		tokenKey?: string,
		options: RefreshOptions = {},
	): Promise<RefreshSummary> {
		const cache = this.app.metadataCache.getFileCache(projectFile)?.frontmatter || {};
		const repo: string = cache.repo;
		const defaultBranch: string = cache.defaultBranch || "trunk";
		if (!repo || !repo.includes("/")) {
			throw new Error("Missing repo field (owner/name) in project dashboard.");
		}

		// Determine which token key to use:
		// - If tokenKey is explicitly '' or '(public)', treat as public repo (no auth)
		// - If tokenKey is undefined, fall back to frontmatter value
		// - Otherwise use the provided tokenKey
		const isPublicRequest = tokenKey === "" || tokenKey === "(public)";
		const resolvedKey = isPublicRequest
			? ""
			: (tokenKey !== undefined ? tokenKey : (cache.github_token_key || ""));

		let token = "";
		if (resolvedKey) {
			const storage = (this.app as any).secretStorage;
			if (!storage || typeof storage.getSecret !== "function") {
				throw new Error("SecretStorage is not available in this Obsidian version.");
			}
			try {
				token = (await storage.getSecret(resolvedKey)) || "";
			} catch {
				token = "";
			}
			// A named key without a secret used to fall back to an anonymous request,
			// which turns a private repo into a confusing 404.
			if (!token) {
				throw new Error(
					`No PAT found for key "${resolvedKey}". Set it in Settings, or mark the repo as Public.`,
				);
			}
		}
		// Update frontmatter if tokenKey was explicitly provided and differs
		if (tokenKey !== undefined && tokenKey !== cache.github_token_key) {
			await this.app.fileManager.processFrontMatter(projectFile, (fm) => {
				fm.github_token_key = tokenKey;
			});
		}

		const [owner, repoName] = repo.split("/");
		const client = new GitHubClient(token);
		let releases: any[];
		try {
			releases = (await client.listReleases(owner, repoName)) || [];
		} catch (err) {
			throw new Error(describeGitHubError(err, `Listing releases of ${repo}`, !!token, "repo"));
		}

		const projectFolder = projectFile.path.replace(/\/Dashboard\.md$/, "");
		await this.ensureFolder(`${projectFolder}/releases`);

		const latestRelease = releases[0];
		for (const rel of releases) {
			await this.upsertRelease(projectFolder, projectFile, rel);
		}

		let commits: UnreleasedCommit[] = [];
		let totalCommits = 0;
		let compareError: string | undefined;
		let compare: any;
		if (latestRelease?.tag_name) {
			try {
				compare = await client.compareCommits(
					owner,
					repoName,
					latestRelease.tag_name,
					defaultBranch,
				);
			} catch (err) {
				compareError =
					`Synced ${releases.length} releases, but ` +
					describeGitHubError(
						err,
						`comparing ${latestRelease.tag_name}...${defaultBranch}`,
						!!token,
						"ref",
					);
			}
		}
		if (compare) {
			commits = (compare.commits || []).map((c: any) => ({
				sha: String(c.sha ?? "").substring(0, 7),
				message: String(c.commit?.message ?? "").split("\n")[0],
				date: c.commit?.author?.date || "",
				url: c.html_url || "",
			}));
			totalCommits = Number(compare.total_commits ?? commits.length);
		}

		// Rewritten as a whole each time (also when the comparison failed, so stale commits
		// do not linger): the set of unreleased commits changes between refreshes.
		await this.writeUnreleasedCommitsNote(projectFolder, buildUnreleasedCommitsNote({
			project: `[[${stripMdExtension(projectFile.path)}|Dashboard]]`,
			base: latestRelease?.tag_name ?? null,
			refreshed: new Date().toISOString(),
			totalCommits,
			truncated: totalCommits > commits.length,
			commits,
			error: compareError,
		}));
		if (compareError) {
			throw new Error(compareError);
		}

		const legacyCommitNotes = await this.cleanUpLegacyCommitNotes(projectFile, projectFolder, options);
		const summary: RefreshSummary = {
			releases: releases.length,
			unreleasedCommits: commits.length,
			legacyCommitNotes,
		};
		const legacyHint = legacyCommitNotes > 0
			? ` ${legacyCommitNotes} old notes in commits/ are no longer used.`
			: "";
		new Notice(`Synced ${summary.releases} releases, ${summary.unreleasedCommits} unreleased commits.${legacyHint}`);
		return summary;
	}

	private async writeUnreleasedCommitsNote(projectFolder: string, content: string): Promise<void> {
		const path = `${projectFolder}/${UNRELEASED_COMMITS_NOTE}.md`;
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) {
			await this.app.vault.modify(existing, content);
		} else {
			await this.app.vault.create(path, content);
		}
	}

	/**
	 * Old versions wrote one note per commit under `<project>/commits/`. Offers once to trash
	 * them; a "no" is remembered on the Dashboard as `legacy_commits: keep`.
	 * @returns how many of those notes are left.
	 */
	private async cleanUpLegacyCommitNotes(
		projectFile: TFile,
		projectFolder: string,
		options: RefreshOptions,
	): Promise<number> {
		const prefix = `${projectFolder}/commits/`;
		const legacy = this.app.vault.getFiles().filter((f) => f.path.startsWith(prefix));
		if (legacy.length === 0 || !options.confirmLegacyCleanup) return legacy.length;

		const fm = this.app.metadataCache.getFileCache(projectFile)?.frontmatter ?? {};
		if (fm.legacy_commits === "keep") return legacy.length;

		if (!(await options.confirmLegacyCleanup(legacy.length))) {
			await this.app.fileManager.processFrontMatter(projectFile, (front) => {
				front.legacy_commits = "keep";
			});
			return legacy.length;
		}
		const fileManager = this.app.fileManager as { trashFile?: (file: TFile) => Promise<void> };
		for (const file of legacy) {
			// trashFile follows the user's "Deleted files" setting; older Obsidian lacks it.
			if (typeof fileManager.trashFile === "function") await fileManager.trashFile(file);
			else await this.app.vault.trash(file, true);
		}
		return 0;
	}

	private async upsertRelease(
		projectFolder: string,
		projectFile: TFile,
		release: any,
	): Promise<void> {
		const tag = release.tag_name;
		if (!tag) return;
		const filePath = `${projectFolder}/releases/${tag}.md`;
		const existing = this.app.vault.getAbstractFileByPath(filePath);

		const releaseUrl = release.html_url ?? release.url ?? "";
		const releaseDate = release.published_at ?? "";

		if (existing instanceof TFile) {
			// Update existing file, preserve id/create via processFrontMatter
			await this.app.fileManager.processFrontMatter(existing, (fm) => {
				fm.project = `[[${stripMdExtension(projectFile.path)}|Dashboard]]`;
				fm.version = tag;
				fm.url = releaseUrl;
				fm.date = releaseDate;
			});
		} else {
			// Create new file via unified createNote
			await this.createNote(
				filePath,
				tag,
				"permanent",
				"project-release",
				{
					project: `[[${stripMdExtension(projectFile.path)}|Dashboard]]`,
					version: tag,
					url: releaseUrl,
					date: releaseDate,
				},
				[
					{
						title: "",
						level: 0,
						content: [release.body || ""],
					},
				],
			);
		}
	}

	async openFile(file: TFile): Promise<void> {
		await this.app.workspace.getLeaf(false).openFile(file);
	}
}

