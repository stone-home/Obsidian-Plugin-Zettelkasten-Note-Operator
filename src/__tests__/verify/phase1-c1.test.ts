/**
 * Independent verification of C1 (one "Unreleased Commits" note rewritten on every refresh).
 *
 * Plan (approach column): the note is rewritten on every Refresh, also when there is no release
 * or the comparison fails, with an empty `commits`; legacy notes are found by path prefix; without
 * a callback nothing is asked or deleted and only the count is reported.
 */

import { App, TFile } from "../../__mocks__/obsidian";
import {
	createMockApp,
	createMockSettings,
	clearVault,
	createMockCommit,
	createMockRelease,
	mockGitHubApi,
	parseNoteFrontmatter,
	setFrontmatterCache,
} from "../../__mocks__/testHelpers";
import { CodeProjectManager, buildUnreleasedCommitsNote } from "../../service/projects/codeProjectManager";

const PROJECT = "Projects/Proj";
const NOTE_PATH = `${PROJECT}/Unreleased Commits.md`;
const RELEASES = "/repos/owner/repo/releases";
const COMPARE = "/repos/owner/repo/compare/v1.0.0...main";

describe("verify C1: refreshProject and the Unreleased Commits note", () => {
	let app: App;
	let manager: CodeProjectManager;
	let projectFile: TFile;
	const noteContent = (): string | undefined => (app.vault as any)._getContent(NOTE_PATH);

	beforeEach(async () => {
		app = createMockApp();
		manager = new CodeProjectManager(app as any, createMockSettings({ projectRootPath: "Projects" }));
		projectFile = (await manager.createProject("Proj")) as unknown as TFile;
		setFrontmatterCache(app.metadataCache, projectFile.path, { repo: "owner/repo", defaultBranch: "main", github_token_key: "gh_key" });
		(app as any).secretStorage = { getSecret: jest.fn().mockResolvedValue("tok") };
	});

	afterEach(() => clearVault(app.vault));

	it("compare fails: the note is still rewritten, with an empty commits list (plan: 'also when the comparison fails')", async () => {
		// First refresh leaves two commits in the note.
		mockGitHubApi({
			[RELEASES]: { json: [createMockRelease({ tag_name: "v1.0.0" })] },
			[COMPARE]: { json: { total_commits: 2, commits: [createMockCommit({ sha: "aaaaaaa1" }), createMockCommit({ sha: "bbbbbbb2" })] } },
		});
		await manager.refreshProject(projectFile as any);
		expect(parseNoteFrontmatter(noteContent()).commits).toHaveLength(2);

		// Second refresh: the comparison fails (e.g. the default branch was renamed).
		mockGitHubApi({
			[RELEASES]: { json: [createMockRelease({ tag_name: "v1.0.0" })] },
			[COMPARE]: { status: 404, json: { message: "Not Found" } },
		});
		await manager.refreshProject(projectFile as any).catch(() => undefined);

		// The stale commits from the first refresh must not remain in the note.
		const fm = parseNoteFrontmatter(noteContent());
		expect(fm.commits).toEqual([]);
	});

	it("marks the note as truncated when GitHub returns fewer commits than total_commits", async () => {
		mockGitHubApi({
			[RELEASES]: { json: [createMockRelease({ tag_name: "v1.0.0" })] },
			[COMPARE]: { json: { total_commits: 300, commits: [createMockCommit({ sha: "aaaaaaa1" }), createMockCommit({ sha: "bbbbbbb2" })] } },
		});

		await manager.refreshProject(projectFile as any);

		const content = noteContent()!;
		const fm = parseNoteFrontmatter(content);
		expect(fm.truncated).toBe(true);
		expect(fm.total_commits).toBe(300);
		expect(content).toContain("2 of 300");
	});

	it("stores sha (7 chars), first message line, date and url per commit", async () => {
		mockGitHubApi({
			[RELEASES]: { json: [createMockRelease({ tag_name: "v1.0.0" })] },
			[COMPARE]: {
				json: {
					total_commits: 1,
					commits: [createMockCommit({ sha: "abcdef0123456789", message: "feat: x: \"y\" #1\n\nbody line", date: "2026-11-10T09:00:00Z" })],
				},
			},
		});

		await manager.refreshProject(projectFile as any);

		const fm = parseNoteFrontmatter(noteContent());
		expect(fm.commits).toEqual([
			{
				sha: "abcdef0",
				message: "feat: x: \"y\" #1",
				date: "2026-11-10T09:00:00Z",
				url: "https://github.com/owner/repo/commit/abcdef0123456789",
			},
		]);
	});

	it("with a callback but no legacy notes: does not ask", async () => {
		mockGitHubApi({ [RELEASES]: { json: [] } });
		const confirmLegacyCleanup = jest.fn().mockResolvedValue(true);

		const summary = await manager.refreshProject(projectFile as any, undefined, { confirmLegacyCleanup });

		expect(confirmLegacyCleanup).not.toHaveBeenCalled();
		expect(summary.legacyCommitNotes).toBe(0);
	});

	it("only counts and trashes notes under this project's commits/ folder", async () => {
		await app.vault.createFolder(`${PROJECT}/commits`);
		await app.vault.create(`${PROJECT}/commits/1111111.md`, "x");
		await app.vault.create(`${PROJECT}/commits-archive/keep.md`, "x");
		await app.vault.create(`Projects/Proj2/commits/2222222.md`, "x");
		mockGitHubApi({ [RELEASES]: { json: [] } });
		const confirmLegacyCleanup = jest.fn().mockResolvedValue(true);

		await manager.refreshProject(projectFile as any, undefined, { confirmLegacyCleanup });

		expect(confirmLegacyCleanup).toHaveBeenCalledWith(1);
		expect(app.vault.getAbstractFileByPath(`${PROJECT}/commits/1111111.md`)).toBeNull();
		expect(app.vault.getAbstractFileByPath(`${PROJECT}/commits-archive/keep.md`)).toBeTruthy();
		expect(app.vault.getAbstractFileByPath(`Projects/Proj2/commits/2222222.md`)).toBeTruthy();
	});

	it("without a callback: does not write legacy_commits to the Dashboard", async () => {
		await app.vault.createFolder(`${PROJECT}/commits`);
		await app.vault.create(`${PROJECT}/commits/1111111.md`, "x");
		mockGitHubApi({ [RELEASES]: { json: [] } });
		const pfm = jest.spyOn(app.fileManager, "processFrontMatter");

		const summary = await manager.refreshProject(projectFile as any);

		expect(summary.legacyCommitNotes).toBe(1);
		expect(pfm).not.toHaveBeenCalled();
	});
});

describe("verify C1: buildUnreleasedCommitsNote body", () => {
	it("keeps a multi-line or piped message on one table row", () => {
		const note = buildUnreleasedCommitsNote({
			project: "[[Projects/Proj/Dashboard|Dashboard]]",
			base: "v1.0.0",
			refreshed: "2026-11-13T00:00:00Z",
			totalCommits: 1,
			truncated: false,
			commits: [{ sha: "abcdef0", message: "a | b\nc", date: "d", url: "https://x" }],
		});

		const rows = note.split("\n").filter((l) => l.startsWith("| abcdef0"));
		expect(rows).toHaveLength(1);
		expect(rows[0]).toContain("a \\| b c");
	});
});
