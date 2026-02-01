import { App, Notice, TFile } from "obsidian";
import { ZettelkastenSettings } from "../../types";
import { GitHubClient } from "../github/githubClient";

export class CodeProjectManager {
	private app: App;
	private settings: ZettelkastenSettings;

	constructor(app: App, settings: ZettelkastenSettings) {
		this.app = app;
		this.settings = settings;
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

		const dashboardPath = `${projectFolder}/Dashboard.md`;
		const existing = this.app.vault.getAbstractFileByPath(dashboardPath);
		if (existing instanceof TFile) return existing;

		const content = this.buildDashboardTemplate(safeName, projectFolder);
		return await this.app.vault.create(dashboardPath, content);
	}

	private buildDashboardTemplate(projectName: string, projectFolder: string): string {
		return [
			"---",
			"type: code-project",
			`project_name: ${projectName}`,
			"repo: owner/name",
			"defaultBranch: trunk",
			"github_token_key: github_token",
			"---",
			"",
			"# Code Project Dashboard",
			"",
			"## Quick Actions",
			"",
			"```dataviewjs",
			"const zk = window.ZettelkastenOperator;",
			"const projectPath = dv.current().file.path;",
			"if (!zk) {",
			"  dv.paragraph('ZettelkastenOperator not available.');",
			"} else {",
			"  const row = dv.el('div', '', { cls: 'zk-dv-actions zk-dv-grid' });",
			"  const tokenRow = row.createDiv({ cls: 'zk-dv-row' });",
			"  tokenRow.createDiv({ text: 'Token', cls: 'zk-dv-label' });",
			"  const tokenControls = tokenRow.createDiv({ cls: 'zk-dv-controls' });",
			"  const tokenSelect = tokenControls.createEl('select');",
			"  const tokenKeys = zk.getGithubTokenKeys ? zk.getGithubTokenKeys() : ['github_token'];",
			"  tokenKeys.forEach(key => tokenSelect.createEl('option', { text: key, value: key }));",
			"  const publicRow = row.createDiv({ cls: 'zk-dv-row' });",
			"  publicRow.createDiv({ text: 'Public Repo', cls: 'zk-dv-label' });",
			"  const publicControls = publicRow.createDiv({ cls: 'zk-dv-controls' });",
			"  const publicToggle = publicControls.createEl('input', { type: 'checkbox' });",
			"  publicControls.createSpan({ text: 'No PAT required' });",
			"  const actionRow = row.createDiv({ cls: 'zk-dv-row' });",
			"  actionRow.createDiv({ text: 'Refresh', cls: 'zk-dv-label' });",
			"  actionRow.createDiv({ cls: 'zk-dv-controls' });",
			"  const refreshBtn = actionRow.createEl('button', { text: 'Refresh Releases', cls: 'zk-dv-action' });",
			"  refreshBtn.onclick = async () => {",
			"    const key = publicToggle.checked ? '' : tokenSelect.value;",
			"    await zk.refreshCodeProject(projectPath, key);",
			"  };",
			"}",
			"```",
			"",
			"## Releases",
			"",
			"```dataview",
			"TABLE version, date, url",
			`FROM "${projectFolder}/releases"`,
			"SORT date DESC",
			"```",
			"",
			"## Unreleased Commits",
			"",
			"```dataview",
			"TABLE sha, message, date, url",
			`FROM "${projectFolder}/commits"`,
			"WHERE released = false",
			"SORT date DESC",
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
			"type: project-release",
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
			"type: project-commit",
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

