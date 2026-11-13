/**
 * C1: unreleased commits live in one generated note, `<project>/Unreleased Commits.md`,
 * rewritten on every refresh, instead of one note per commit under `<project>/commits/`.
 * Old per-commit notes are only removed after the user agrees.
 */

import { App, TFile } from "../../../__mocks__/obsidian";
import {
	createMockApp,
	createMockSettings,
	clearVault,
	createMockCommit,
	createMockRelease,
	mockGitHubApi,
	parseNoteFrontmatter,
	requestedUrls,
	setFrontmatterCache,
} from "../../../__mocks__/testHelpers";
import * as cpm from "../../../service/projects/codeProjectManager";
import { CodeProjectManager } from "../../../service/projects/codeProjectManager";

const buildUnreleasedCommitsNote = (input: any): string => (cpm as any).buildUnreleasedCommitsNote(input);

const PROJECT = "Projects/Proj";
const NOTE_PATH = `${PROJECT}/Unreleased Commits.md`;
const RELEASES = "/repos/owner/repo/releases";
const COMPARE = "/repos/owner/repo/compare/v1.0.0...main";

/** Data rows of the first Markdown table in the body (header and separator skipped). */
function tableRows(content: string): string[] {
	const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
	const lines = body.split(/\r?\n/).filter((l) => l.trim().startsWith("|"));
	return lines.slice(2);
}

describe("buildUnreleasedCommitsNote (C1)", () => {
	const commits = [
		{ sha: "abc1234567890", message: "feat: add \"quoted\" thing", date: "2026-11-10T09:00:00Z", url: "https://github.com/owner/repo/commit/abc1234567890" },
		{ sha: "def4567890123", message: "fix a|b pipe", date: "2026-11-11T09:00:00Z", url: "https://github.com/owner/repo/commit/def4567890123" },
	];

	it("puts the commit data into YAML frontmatter that round-trips", () => {
		const note = buildUnreleasedCommitsNote({
			project: "Proj",
			base: "v1.0.0",
			refreshed: "2026-11-13T08:00:00Z",
			totalCommits: 2,
			truncated: false,
			commits,
		});

		const fm = parseNoteFrontmatter(note);
		expect(fm.commits).toEqual(commits);
		expect(fm.base).toBe("v1.0.0");
		expect(fm.refreshed).toBe("2026-11-13T08:00:00Z");
		expect(fm.total_commits).toBe(2);
		expect(fm.truncated).toBe(false);
		expect(fm.tags).toEqual(expect.arrayContaining(["type/project-unreleased"]));
	});

	it("has one table row per commit and escapes '|' in messages", () => {
		const note = buildUnreleasedCommitsNote({
			project: "Proj",
			base: "v1.0.0",
			refreshed: "2026-11-13T08:00:00Z",
			totalCommits: 2,
			truncated: false,
			commits,
		});

		const rows = tableRows(note);
		expect(rows).toHaveLength(2);
		expect(rows.some((r) => r.includes("abc1234"))).toBe(true);
		const pipeRow = rows.find((r) => r.includes("def4567"));
		expect(pipeRow).toBeDefined();
		expect(pipeRow).toContain("fix a\\|b pipe");
	});

	it("writes an empty list and a null base when there is nothing to compare", () => {
		const note = buildUnreleasedCommitsNote({
			project: "Proj",
			base: null,
			refreshed: "2026-11-13T08:00:00Z",
			totalCommits: 0,
			truncated: false,
			commits: [],
		});

		const fm = parseNoteFrontmatter(note);
		expect(fm.commits).toEqual([]);
		expect(fm.base).toBeNull();
		expect(tableRows(note)).toHaveLength(0);
	});
});

describe("CodeProjectManager.refreshProject unreleased commits note (C1)", () => {
	let app: App;
	let manager: CodeProjectManager;
	let projectFile: TFile;

	const legacyFiles = () => app.vault.getFiles().filter((f) => f.path.startsWith(`${PROJECT}/commits/`));
	const noteContent = (): string | undefined => (app.vault as any)._getContent(NOTE_PATH);

	function mockOneRelease(commitShas: string[]) {
		mockGitHubApi({
			[RELEASES]: { json: [createMockRelease({ tag_name: "v1.0.0" })] },
			[COMPARE]: {
				json: {
					total_commits: commitShas.length,
					commits: commitShas.map((sha, i) =>
						createMockCommit({ sha, message: `change ${i}`, date: `2026-11-1${i}T00:00:00Z` })
					),
				},
			},
		});
	}

	async function addLegacyNotes() {
		await app.vault.createFolder(`${PROJECT}/commits`);
		await app.vault.create(`${PROJECT}/commits/1111111.md`, "---\nsha: 1111111\n---\n");
		await app.vault.create(`${PROJECT}/commits/2222222.md`, "---\nsha: 2222222\n---\n");
	}

	beforeEach(async () => {
		app = createMockApp();
		manager = new CodeProjectManager(app as any, createMockSettings({ projectRootPath: "Projects" }));
		projectFile = (await manager.createProject("Proj")) as unknown as TFile;
		setFrontmatterCache(app.metadataCache, projectFile.path, {
			repo: "owner/repo",
			defaultBranch: "main",
			github_token_key: "gh_key",
		});
		(app as any).secretStorage = { getSecret: jest.fn().mockResolvedValue("tok") };
	});

	afterEach(() => {
		clearVault(app.vault);
	});

	it("createProject and importExistingProject no longer create a commits folder", async () => {
		expect(app.vault.getAbstractFileByPath(`${PROJECT}/commits`)).toBeNull();

		await manager.importExistingProject("Projects/Imported");
		expect(app.vault.getAbstractFileByPath("Projects/Imported/commits")).toBeNull();
		expect(app.vault.getAbstractFileByPath("Projects/Imported/releases")).toBeTruthy();
	});

	it("writes Unreleased Commits.md with the compare result and creates nothing under commits/", async () => {
		mockOneRelease(["aaaaaaa0000001", "bbbbbbb0000002"]);

		await manager.refreshProject(projectFile as any);

		const content = noteContent();
		expect(content).toBeDefined();
		const fm = parseNoteFrontmatter(content);
		expect(fm.commits.map((c: any) => c.sha)).toEqual(
			expect.arrayContaining([expect.stringMatching(/^aaaaaaa/), expect.stringMatching(/^bbbbbbb/)])
		);
		expect(fm.commits).toHaveLength(2);
		expect(fm.base).toBe("v1.0.0");
		expect(fm.total_commits).toBe(2);
		expect(fm.truncated).toBe(false);
		expect(legacyFiles()).toHaveLength(0);
		expect(app.vault.getAbstractFileByPath(`${PROJECT}/commits`)).toBeNull();
	});

	it("rewrites the whole note on the next refresh", async () => {
		mockOneRelease(["aaaaaaa0000001", "bbbbbbb0000002"]);
		await manager.refreshProject(projectFile as any);

		mockOneRelease(["ccccccc0000003"]);
		await manager.refreshProject(projectFile as any);

		const content = noteContent()!;
		const fm = parseNoteFrontmatter(content);
		expect(fm.commits).toHaveLength(1);
		expect(fm.commits[0].sha).toMatch(/^ccccccc/);
		expect(content).not.toContain("aaaaaaa");
		expect(content).not.toContain("bbbbbbb");
	});

	it("writes an empty list with base null when the repo has no releases", async () => {
		mockGitHubApi({ [RELEASES]: { json: [] } });

		await manager.refreshProject(projectFile as any);

		const fm = parseNoteFrontmatter(noteContent());
		expect(fm.commits).toEqual([]);
		expect(fm.base).toBeNull();
		expect(requestedUrls().some((u) => u.includes("/compare/"))).toBe(false);
	});

	it("summary no longer reports markedReleased", async () => {
		mockOneRelease(["aaaaaaa0000001"]);

		const summary = await manager.refreshProject(projectFile as any);

		expect(summary).toBeDefined();
		expect(summary).not.toHaveProperty("markedReleased");
	});

	describe("legacy per-commit notes", () => {
		it("without a callback: deletes nothing and reports the count", async () => {
			await addLegacyNotes();
			mockOneRelease(["aaaaaaa0000001"]);

			const summary: any = await manager.refreshProject(projectFile as any);

			expect(legacyFiles()).toHaveLength(2);
			expect(summary).toMatchObject({ legacyCommitNotes: 2 });
		});

		it("callback true: trashes each note with fileManager.trashFile, after the new note is written", async () => {
			await addLegacyNotes();
			mockOneRelease(["aaaaaaa0000001"]);
			const trashFile = jest.spyOn(app.fileManager as any, "trashFile");
			const vaultTrash = jest.spyOn(app.vault, "trash");
			let noteWrittenBeforeAsking = false;
			const confirmLegacyCleanup = jest.fn(async (_count: number) => {
				noteWrittenBeforeAsking = (noteContent() ?? "").includes("aaaaaaa");
				return true;
			});

			await (manager as any).refreshProject(projectFile, undefined, { confirmLegacyCleanup });

			expect(confirmLegacyCleanup).toHaveBeenCalledTimes(1);
			expect(confirmLegacyCleanup).toHaveBeenCalledWith(2);
			expect(noteWrittenBeforeAsking).toBe(true);
			expect(trashFile).toHaveBeenCalledTimes(2);
			expect(trashFile.mock.calls.map(([f]) => (f as any).path).sort()).toEqual([
				`${PROJECT}/commits/1111111.md`,
				`${PROJECT}/commits/2222222.md`,
			]);
			expect(vaultTrash).not.toHaveBeenCalled();
			expect(legacyFiles()).toHaveLength(0);
		});

		it("callback true without fileManager.trashFile: falls back to vault.trash(file, true)", async () => {
			await addLegacyNotes();
			mockOneRelease(["aaaaaaa0000001"]);
			delete (app.fileManager as any).trashFile;
			const vaultTrash = jest.spyOn(app.vault, "trash");

			await (manager as any).refreshProject(projectFile, undefined, {
				confirmLegacyCleanup: jest.fn().mockResolvedValue(true),
			});

			expect(vaultTrash).toHaveBeenCalledTimes(2);
			for (const [, system] of vaultTrash.mock.calls) {
				expect(system).toBe(true);
			}
			expect(legacyFiles()).toHaveLength(0);
		});

		it("callback false: keeps the notes and records legacy_commits: keep on the Dashboard", async () => {
			await addLegacyNotes();
			mockOneRelease(["aaaaaaa0000001"]);

			await (manager as any).refreshProject(projectFile, undefined, {
				confirmLegacyCleanup: jest.fn().mockResolvedValue(false),
			});

			expect(legacyFiles()).toHaveLength(2);
			const dashboardFm = parseNoteFrontmatter((app.vault as any)._getContent(projectFile.path));
			expect(dashboardFm.legacy_commits).toBe("keep");
		});

		it("does not ask again once the Dashboard says legacy_commits: keep", async () => {
			await addLegacyNotes();
			await app.fileManager.processFrontMatter(projectFile, (fm) => {
				fm.legacy_commits = "keep";
			});
			mockOneRelease(["aaaaaaa0000001"]);
			const confirmLegacyCleanup = jest.fn().mockResolvedValue(true);

			await (manager as any).refreshProject(projectFile, undefined, { confirmLegacyCleanup });

			expect(confirmLegacyCleanup).not.toHaveBeenCalled();
			expect(legacyFiles()).toHaveLength(2);
		});
	});
});
