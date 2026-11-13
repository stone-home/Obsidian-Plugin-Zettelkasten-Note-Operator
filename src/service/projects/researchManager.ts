import { App, TFile, TFolder, Notice } from "obsidian";
import {
	ObsidianNoteFactory as LibFactory,
	NoteType,
	NoteTemplateConfig,
	NoteTemplateSection,
} from "markdown-note-orm";
import { GithubPullRule, ZettelkastenSettings } from "../../types";
import { Logger } from "../../logger";
import { stripMdExtension } from "../../utils/path";
import { GitHubClient } from "../github/githubClient";
import { describeGitHubError } from "../github/errors";
import { bytesToBase64, gitBlobSha } from "../github/gitHash";
import { GitHubContentEntry, resolvePullTarget, selectPullFiles, validatePullRule } from "../github/repoPull";

/** Outcome of one Pull from GitHub. */
export interface PullSummary {
	added: number;
	updated: number;
	skipped: number;
	failed: number;
	/** Ids in the Dashboard's github_pull that match no rule in Settings. */
	unknownRules: string[];
	warnings: string[];
}

const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";

/** Head commit of a branch and the entries of one folder in that same commit. */
const READ_FOLDER_QUERY = `query ($owner: String!, $name: String!, $ref: String!, $path: String!) {
  repository(owner: $owner, name: $name) {
    ref(qualifiedName: $ref) {
      target {
        ... on Commit {
          oid
          file(path: $path) {
            object {
              ... on Tree {
                entries { name oid type }
              }
            }
          }
        }
      }
    }
  }
}`;

const CREATE_COMMIT_MUTATION = `mutation ($input: CreateCommitOnBranchInput!) {
  createCommitOnBranch(input: $input) {
    commit { oid }
  }
}`;

/** Debug info for the last Push to GitHub request (headers/body/params), for display in Quick Actions. */
export type LastPushRequestDebug = {
	url: string;
	method: string;
	headers: Record<string, string>;
	bodySummary: { message: string; branch: string; contentLength: number; sha?: string };
	params: { repo: string; defaultBranch: string; path: string; targetFolder?: string };
	responseStatus?: number;
	errorMessage?: string;
};

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
		const prefix = this.getProjectPrefix(projectFile);
		const fileName = prefix ? `${prefix} - ${safeTitle}` : safeTitle;
		const filePath = `${folder}/${fileName}.md`;
		if (this.app.vault.getAbstractFileByPath(filePath)) {
			throw new Error("Objective already exists.");
		}
		const blockType = this.settings.dataviewCodeBlockType || "zettelkasten-query";
		return await this.createNote(
			filePath,
			fileName,
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
						`objectivePath: "${fileName}"`,
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
		const prefix = this.getProjectPrefix(projectFile);
		const fileName = prefix ? `${prefix} - ${safeTitle}` : safeTitle;
		const filePath = `${folder}/${fileName}.md`;
		if (this.app.vault.getAbstractFileByPath(filePath)) {
			throw new Error("Draft with this title already exists.");
		}
		const baseProps = {
			project: `[[${stripMdExtension(projectFile.path)}|Dashboard]]`,
			title: safeTitle,
			section_title: safeTitle,
			status: "draft",
			start: "",
			end: "",
		};
		// Merge template config properties if provided
		const finalProps = templateConfig?.properties
			? { ...baseProps, ...templateConfig.properties }
			: baseProps;
		const finalSections = templateConfig?.sections || [];
		return await this.createNote(
			filePath,
			fileName,
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
		const prefix = this.getProjectPrefix(projectFile);
		const fileName = prefix ? `${prefix} - ${safeTitle}` : safeTitle;
		const filePath = `${folder}/${fileName}.md`;
		if (this.app.vault.getAbstractFileByPath(filePath)) {
			throw new Error("Step already exists.");
		}
		return await this.createNote(
			filePath,
			fileName,
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
		const prefix = this.getProjectPrefix(projectFile);
		const fileName = prefix ? `${prefix} - ${safeTitle}` : safeTitle;
		const filePath = `${folder}/${fileName}.md`;
		if (this.app.vault.getAbstractFileByPath(filePath)) {
			throw new Error("Experiment already exists.");
		}
		return await this.createNote(
			filePath,
			fileName,
			"permanent",
			"research-experiment",
			{
				project: `[[${stripMdExtension(projectFile.path)}|Dashboard]]`,
				title: safeTitle,
				status: "planned",
				start: "",
				end: "",
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
		updates: {
			github_token_key?: string;
			public_repo?: boolean;
			repo?: string;
			defaultBranch?: string;
			github_target_folder?: string;
		},
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
	 * Uses GitHub Contents API to upload/update files. All pushes use PAT when configured.
	 */
	async pushToGitHub(
		projectFile: TFile,
		tokenKey?: string,
	): Promise<{ successCount: number; errorCount: number; lastRequestDebug?: LastPushRequestDebug }> {
		const projectFolder = this.getProjectFolder(projectFile);
		const promptsFolder = `${projectFolder}/prompts`;

		// Read dashboard frontmatter to get repo info
		const cache = this.app.metadataCache.getFileCache(projectFile);
		const fm = cache?.frontmatter || {};
		const repo = fm.repo;
		const defaultBranch = fm.defaultBranch || "main";
		const targetFolderRaw = (fm.github_target_folder as string) ?? "prompts";
		const targetFolder = targetFolderRaw.replace(/^\/+|\/+$/g, "").trim() || "prompts";

		if (!repo) {
			new Notice("No GitHub repo configured. Set 'repo' in dashboard frontmatter.");
			return { successCount: 0, errorCount: 0 };
		}

		// All pushes use PAT: tokenKey from callback or dashboard frontmatter (e.g. Research Quick Actions PAT dropdown)
		const resolvedTokenKey = tokenKey ?? (fm.github_token_key as string | undefined) ?? "";
		if (!resolvedTokenKey) {
			new Notice("Push to GitHub requires a PAT. Set a PAT in Settings and select it in the dashboard.");
			return { successCount: 0, errorCount: 0 };
		}

		const storage = (this.app as any).secretStorage;
		if (!storage || typeof storage.getSecret !== "function") {
			new Notice("SecretStorage not available. Configure PAT in Settings → Community plugins → Zettelkasten Operator.");
			this.logger.warn("pushToGitHub: SecretStorage not available");
			return { successCount: 0, errorCount: 0 };
		}
		let token: string | null = null;
		try {
			token = await storage.getSecret(resolvedTokenKey);
		} catch {
			this.logger.warn("Failed to get token from SecretStorage for key: " + resolvedTokenKey);
		}
		if (!token) {
			new Notice("No PAT found for key \"" + resolvedTokenKey + "\". Set PAT in Settings and select it in the dashboard.");
			return { successCount: 0, errorCount: 0 };
		}

		// Get files in prompts folder
		const promptsDir = this.app.vault.getAbstractFileByPath(promptsFolder);
		if (!promptsDir || !(promptsDir instanceof TFolder)) {
			new Notice(`Prompts folder not found: ${promptsFolder}. Generate AI prompts first.`);
			return { successCount: 0, errorCount: 0 };
		}

		const files = promptsDir.children.filter(
			(f): f is TFile => f instanceof TFile && f.extension === "md"
		);

		if (files.length === 0) {
			new Notice("No prompts to push. Generate AI prompts first.");
			return { successCount: 0, errorCount: 0 };
		}

		const [owner, repoName] = String(repo).split("/");
		const client = new GitHubClient(token);
		const baseDebug = {
			url: GITHUB_GRAPHQL_URL,
			method: "POST",
			headers: {
				Accept: "application/vnd.github+json",
				"Content-Type": "application/json",
				Authorization: "Bearer ***",
			},
			params: { repo, defaultBranch, path: targetFolder, targetFolder },
		};

		// Hash exactly the bytes that would be uploaded, so unchanged prompts can be skipped.
		const local = await Promise.all(
			files.map(async (file) => {
				const bytes = new Uint8Array(await this.app.vault.readBinary(file));
				return { name: file.name, bytes, sha: await gitBlobSha(bytes) };
			}),
		);

		let lastRequestDebug: LastPushRequestDebug | undefined;
		// The second attempt only runs when the branch moved between our query and the commit.
		for (let attempt = 0; attempt < 2; attempt++) {
			let remote: { headOid: string; oids: Map<string, string> } | null;
			try {
				remote = await this.readPromptsOnBranch(client, owner, repoName, defaultBranch, targetFolder);
			} catch (err) {
				const message = describeGitHubError(err, `Reading ${repo}`, true, "repo");
				new Notice(`Push failed: ${message}`);
				return { successCount: 0, errorCount: local.length, lastRequestDebug };
			}
			if (!remote) {
				new Notice(`Push failed: branch "${defaultBranch}" was not found in ${repo}. Create it on GitHub or change the branch in the dashboard.`);
				return { successCount: 0, errorCount: local.length, lastRequestDebug };
			}

			const changed = local.filter((f) => remote!.oids.get(f.name) !== f.sha);
			if (changed.length === 0) {
				new Notice("Nothing to push: the prompts on GitHub are already up to date.");
				return { successCount: 0, errorCount: 0, lastRequestDebug };
			}

			const headline = `Update ${changed.length} prompt${changed.length === 1 ? "" : "s"} from Obsidian`;
			const additions = changed.map((f) => ({
				path: `${targetFolder}/${f.name}`,
				contents: bytesToBase64(f.bytes),
			}));
			lastRequestDebug = {
				...baseDebug,
				bodySummary: {
					message: headline,
					branch: defaultBranch,
					contentLength: additions.reduce((n, a) => n + a.contents.length, 0),
					sha: remote.headOid,
				},
			};

			try {
				await client.graphql(CREATE_COMMIT_MUTATION, {
					input: {
						branch: { repositoryNameWithOwner: repo, branchName: defaultBranch },
						message: { headline },
						fileChanges: { additions },
						expectedHeadOid: remote.headOid,
					},
				});
				this.logger.info(`Pushed ${changed.length} prompts to ${repo} in one commit`);
				new Notice(`Pushed ${changed.length} prompt${changed.length === 1 ? "" : "s"} to GitHub in one commit.`);
				return { successCount: changed.length, errorCount: 0, lastRequestDebug };
			} catch (err) {
				const message = Logger.getErrorMessage(err);
				// GitHub: 'Expected branch to point to "<oid>" but it did not.' (expectedHeadOid is stale)
				const headMoved = /expected branch to point to/i.test(message);
				if (headMoved && attempt === 0) {
					this.logger.info("Branch moved during push; querying again and retrying once");
					continue;
				}
				const status = (err as { status?: number } | null)?.status;
				const described = describeGitHubError(err, `Committing to ${repo}@${defaultBranch}`, true, "repo");
				lastRequestDebug = { ...lastRequestDebug, responseStatus: status, errorMessage: described.slice(0, 400) };
				this.logger.logError("Push to GitHub failed:", err);
				new Notice(`Push failed: ${described}`);
				return { successCount: 0, errorCount: changed.length, lastRequestDebug };
			}
		}
		// Unreachable: the loop always returns.
		return { successCount: 0, errorCount: local.length, lastRequestDebug };
	}

	/**
	 * Head commit of the branch and the git blob ids of the files directly in `folder`,
	 * read from the same commit. Returns null when the branch does not exist.
	 */
	private async readPromptsOnBranch(
		client: GitHubClient,
		owner: string,
		name: string,
		branch: string,
		folder: string,
	): Promise<{ headOid: string; oids: Map<string, string> } | null> {
		const data = await client.graphql<any>(READ_FOLDER_QUERY, {
			owner,
			name,
			ref: `refs/heads/${branch}`,
			path: folder,
		});
		const target = data?.repository?.ref?.target;
		if (!target?.oid) return null;
		const entries: Array<{ name: string; oid: string; type: string }> = target.file?.object?.entries ?? [];
		return {
			headOid: target.oid,
			oids: new Map(entries.filter((e) => e.type === "blob").map((e) => [e.name, e.oid])),
		};
	}

	/** Sets which pull rules (by id) this project uses; written to the Dashboard's github_pull. */
	async setPullRules(projectFile: TFile, ids: string[]): Promise<void> {
		await this.app.fileManager.processFrontMatter(projectFile, (fm) => {
			fm.github_pull = [...ids];
		});
	}

	/**
	 * Downloads the files selected by the project's pull rules from the Dashboard's repo.
	 * The repo wins: changed files overwrite the local copy; local files are never deleted.
	 * Throws for a missing repo or PAT; problems with single folders or files are reported
	 * in the summary and do not stop the other rules.
	 */
	async pullFromGitHub(projectFile: TFile, tokenKey?: string): Promise<PullSummary> {
		const fm = this.app.metadataCache.getFileCache(projectFile)?.frontmatter ?? {};
		const repo = String(fm.repo ?? "").trim();
		if (!repo.includes("/")) {
			throw new Error("Missing repo field (owner/name) in the research dashboard.");
		}
		const branch = String(fm.defaultBranch || "main");
		const key = tokenKey ?? (fm.github_token_key as string | undefined) ?? "";
		let token = "";
		if (key) {
			token = await this.readPat(key);
		} else if (fm.public_repo !== true) {
			throw new Error("Pulling from this repo needs a PAT. Pick one in Quick Actions, or tick Public if the repo is public.");
		}

		const [owner, repoName] = repo.split("/");
		const client = new GitHubClient(token);
		const projectFolder = this.getProjectFolder(projectFile);
		const rulesById = new Map((this.settings.githubPullRules ?? []).map((r) => [r.id, r] as [string, GithubPullRule]));
		const ids: string[] = Array.isArray(fm.github_pull) ? fm.github_pull.map((id: unknown) => String(id)) : [];
		const summary: PullSummary = { added: 0, updated: 0, skipped: 0, failed: 0, unknownRules: [], warnings: [] };

		for (const id of ids) {
			const rule = rulesById.get(id);
			if (!rule) {
				summary.unknownRules.push(id);
				continue;
			}
			// Rules can be hand-edited in data.json; a broken one must not stop the others.
			const problem = validatePullRule(rule);
			if (problem) {
				summary.failed++;
				summary.warnings.push(`Skipped rule ${rule.id}: ${problem}`);
				continue;
			}
			let entries: GitHubContentEntry[];
			try {
				const listing = await client.listDirectory(owner, repoName, rule.sourceDir, branch);
				if (!Array.isArray(listing)) {
					throw new Error(`${rule.sourceDir} is a file, not a folder`);
				}
				entries = listing;
			} catch (err) {
				summary.failed++;
				summary.warnings.push(describeGitHubError(err, `Listing ${rule.sourceDir} in ${repo}`, !!token, "path"));
				continue;
			}
			if (entries.length >= 1000) {
				summary.warnings.push(`${rule.sourceDir} has 1000 or more entries; GitHub lists at most 1000, so some files may be missing.`);
			}
			for (const entry of selectPullFiles(entries, rule)) {
				await this.pullOneFile(client, owner, repoName, branch, projectFolder, rule, entry, !!token, summary);
			}
		}

		const unknown = summary.unknownRules.length > 0 ? ` Unknown rule ids: ${summary.unknownRules.join(", ")}.` : "";
		new Notice(
			`Pulled from GitHub: ${summary.added} added, ${summary.updated} updated, ${summary.skipped} skipped, ${summary.failed} failed.${unknown}`,
		);
		if (summary.warnings.length > 0) {
			new Notice(summary.warnings.join("\n"), 15000);
		}
		return summary;
	}

	private async pullOneFile(
		client: GitHubClient,
		owner: string,
		repoName: string,
		branch: string,
		projectFolder: string,
		rule: GithubPullRule,
		entry: GitHubContentEntry,
		authed: boolean,
		summary: PullSummary,
	): Promise<void> {
		try {
			await this.pullOneFileUnsafe(client, owner, repoName, branch, projectFolder, rule, entry, authed, summary);
		} catch (err) {
			// A vault write or folder problem affects only this file.
			summary.failed++;
			summary.warnings.push(`Could not save "${entry.name}" from ${rule.sourceDir}: ${Logger.getErrorMessage(err)}`);
		}
	}

	private async pullOneFileUnsafe(
		client: GitHubClient,
		owner: string,
		repoName: string,
		branch: string,
		projectFolder: string,
		rule: GithubPullRule,
		entry: GitHubContentEntry,
		authed: boolean,
		summary: PullSummary,
	): Promise<void> {
		const path = resolvePullTarget(projectFolder, rule.target, entry.name);
		if (!path) {
			summary.failed++;
			summary.warnings.push(`Skipped "${entry.name}": the file name or the target folder "${rule.target}" cannot be used in this vault.`);
			return;
		}
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing && !(existing instanceof TFile)) {
			summary.failed++;
			summary.warnings.push(`Skipped "${path}": a folder with that name already exists.`);
			return;
		}
		if (existing instanceof TFile) {
			const local = await this.app.vault.readBinary(existing);
			if ((await gitBlobSha(local)) === entry.sha) {
				summary.skipped++;
				return;
			}
		}
		const repoPath = entry.path || `${rule.sourceDir}/${entry.name}`;
		let data: ArrayBuffer;
		try {
			data = await client.downloadRaw(owner, repoName, repoPath, branch);
		} catch (err) {
			summary.failed++;
			summary.warnings.push(describeGitHubError(err, `Downloading ${repoPath}`, authed, "path"));
			return;
		}
		if (existing instanceof TFile) {
			await this.app.vault.modifyBinary(existing, data);
			summary.updated++;
		} else {
			await this.ensureFolderPath(path.slice(0, path.lastIndexOf("/")));
			await this.app.vault.createBinary(path, data);
			summary.added++;
		}
	}

	/** Creates each missing folder of `folderPath`, one segment at a time. */
	private async ensureFolderPath(folderPath: string): Promise<void> {
		let current = "";
		for (const segment of folderPath.split("/").filter((s) => s.length > 0)) {
			current = current ? `${current}/${segment}` : segment;
			const existing = this.app.vault.getAbstractFileByPath(current);
			if (!existing) {
				await this.app.vault.createFolder(current);
			} else if (existing instanceof TFile) {
				throw new Error(`"${current}" is a file, so it cannot hold the pulled files`);
			}
		}
	}

	/** Secret stored under `key`; throws when SecretStorage or the secret is missing. */
	private async readPat(key: string): Promise<string> {
		const storage = (this.app as any).secretStorage;
		if (!storage || typeof storage.getSecret !== "function") {
			throw new Error("SecretStorage is not available in this Obsidian version.");
		}
		let token = "";
		try {
			token = (await storage.getSecret(key)) || "";
		} catch {
			token = "";
		}
		if (!token) {
			throw new Error(`No PAT found for key "${key}". Set it in Settings, or mark the repo as Public.`);
		}
		return token;
	}

	private getProjectFolder(projectFile: TFile): string {
		return projectFile.path.replace(/\/Dashboard\.md$/, "");
	}

	/**
	 * Short code for the project (e.g. "MR26", "ZO") used as filename prefix for objectives/steps/drafts/experiments.
	 * Reads Dashboard frontmatter `project_code`; if empty, derives from project folder name (e.g. "My-Research-2026" → "MR26").
	 */
	private getProjectCode(projectFile: TFile): string {
		const cache = this.app.metadataCache.getFileCache(projectFile);
		const fromFm = cache?.frontmatter?.project_code;
		if (fromFm != null && String(fromFm).trim() !== "") {
			return String(fromFm).trim();
		}
		return this.deriveShortCodeFromFolder(this.getProjectFolder(projectFile));
	}

	/**
	 * Full prefix for child notes: project code + creation date (e.g. "TP20260213").
	 * Uses Dashboard frontmatter `create` (YYYY-MM-DD, written by markdown-note-orm); if missing, uses Dashboard file ctime.
	 */
	private getProjectPrefix(projectFile: TFile): string {
		const code = this.getProjectCode(projectFile);
		const cache = this.app.metadataCache.getFileCache(projectFile);
		const createdFm = cache?.frontmatter?.create;
		let dateStr = "";
		if (createdFm != null && String(createdFm).trim() !== "") {
			// Normalize to YYYYMMDD (e.g. "2026-02-13" → "20260213")
			dateStr = String(createdFm).trim().replace(/-/g, "").slice(0, 8);
		}
		if (!dateStr && projectFile.stat) {
			dateStr = new Date(projectFile.stat.ctime).toISOString().slice(0, 10).replace(/-/g, "");
		}
		return dateStr ? `${code}${dateStr}` : code;
	}

	/**
	 * Derive a short acronym from project folder path: last segment, first letter of each part (or digits).
	 * e.g. "Research/My-Research-2026" → "MR26", "Research/zk-operator" → "ZO", "Research/TestProject" → "TP".
	 */
	private deriveShortCodeFromFolder(projectFolder: string): string {
		const segment = projectFolder.split("/").pop() || "";
		// Split by hyphen/underscore/space, and by camelCase (e.g. TestProject → Test, Project)
		const byDelim = segment.split(/[-_\s]+/).filter(Boolean);
		const parts = byDelim.flatMap((p) =>
			p.replace(/([A-Z])/g, " $1").trim().split(/\s+/).filter(Boolean).length > 1
				? p.replace(/([A-Z])/g, " $1").trim().split(/\s+/).filter(Boolean)
				: [p],
		);
		const code = parts
			.map((p) => {
				if (/^\d+$/.test(p)) return p.length >= 2 ? p.slice(-2) : p;
				return p.charAt(0).toUpperCase();
			})
			.join("");
		return code || "P";
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
				conferences: [],
				granularity: "day",
				project_code: "",
				github_pull: [],
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
						"flowchart TD",
						"  T[Takeaway L1] --> R[Problem Router]",
						"  R --> A{Atom coverage}",
						"  A -->|MISSING| AN[Copilot-Atom Note L2]",
						"  A -->|EXISTS| SOTA[SOTA + cite]",
						"  R --> E[Effect on Problem]",
						"  E -->|GAP-SHARPEN / COMPETE| P[Update Problem gap / Approaches L3]",
						"  E -->|METHOD-ONLY| Stop1[Stop at Atom]",
						"  P --> RQ{Touches success criterion?}",
						"  RQ -->|yes| Brief[Patch RQ Brief L4]",
						"  Brief --> C[Maybe adjust Cn / Exp L5]",
						"  RQ -->|no| OE[Park as Open edge or DQ]",
						"```",
						"",
						"**Target Conferences** (set `conferences` in frontmatter to CFP note links):",
						"```" + blockType,
						"zk-research-target-conference",
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
						"*Time granularity: set frontmatter `granularity` (or in block below) to `day`, `week`, or `month`.*",
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

