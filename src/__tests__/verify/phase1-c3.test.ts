/**
 * Independent verification of C3 (GitHub errors on refresh).
 *
 * Plan: missing repo / PAT key without a PAT throw readable errors (no silent anonymous request);
 * 401/403/404 explained; compare 404 hints at a missing tag/branch; summary Notice on success;
 * the projects modal catches the error and no longer says "refreshed" after a failure.
 */

import * as obsidian from "../../__mocks__/obsidian";
import { App, TFile, requestUrl } from "../../__mocks__/obsidian";
import {
	createMockApp,
	createMockSettings,
	clearVault,
	createMockRelease,
	createFakeElement,
	mockGitHubApi,
	parseNoteFrontmatter,
	setFrontmatterCache,
} from "../../__mocks__/testHelpers";
import { CodeProjectManager } from "../../service/projects/codeProjectManager";
import { CodeProjectsModal } from "../../modals/codeProjectsModal";

const RELEASES = "/repos/owner/repo/releases";

let noticeSpy: jest.SpyInstance;
const notices = () => noticeSpy.mock.calls.map((c) => String(c[0]));

beforeEach(() => {
	noticeSpy = jest.spyOn(obsidian, "Notice").mockImplementation((() => ({ hide: () => {} })) as any);
});

afterEach(() => {
	noticeSpy.mockRestore();
});

describe("verify C3: refreshProject error paths", () => {
	let app: App;
	let manager: CodeProjectManager;
	let projectFile: TFile;
	let getSecret: jest.Mock;

	beforeEach(async () => {
		app = createMockApp();
		manager = new CodeProjectManager(app as any, createMockSettings({ projectRootPath: "Projects" }));
		projectFile = (await manager.createProject("ErrProj")) as unknown as TFile;
		getSecret = jest.fn(async (key: string) => (key === "gh_key" ? "tok" : null));
		(app as any).secretStorage = { getSecret };
	});

	afterEach(() => clearVault(app.vault));

	it("PAT key taken from the dashboard (no tokenKey argument) without a secret: throws, no request", async () => {
		setFrontmatterCache(app.metadataCache, projectFile.path, { repo: "owner/repo", github_token_key: "gone_key" });

		await expect(manager.refreshProject(projectFile as any)).rejects.toThrow(/No PAT found for key "gone_key"/);
		expect(requestUrl).not.toHaveBeenCalled();
	});

	it("getSecret throwing is reported as a missing PAT, no request", async () => {
		setFrontmatterCache(app.metadataCache, projectFile.path, { repo: "owner/repo", github_token_key: "gh_key" });
		getSecret.mockRejectedValue(new Error("keychain locked"));

		await expect(manager.refreshProject(projectFile as any)).rejects.toThrow(/No PAT found for key "gh_key"/);
		expect(requestUrl).not.toHaveBeenCalled();
	});

	it("a missing PAT does not overwrite github_token_key on the dashboard", async () => {
		await app.vault.modify(projectFile, "---\nrepo: owner/repo\ngithub_token_key: gh_key\n---\n");
		setFrontmatterCache(app.metadataCache, projectFile.path, { repo: "owner/repo", github_token_key: "gh_key" });

		await expect(manager.refreshProject(projectFile as any, "missing_key")).rejects.toThrow();

		const fm = parseNoteFrontmatter((app.vault as any)._getContent(projectFile.path));
		expect(fm.github_token_key).toBe("gh_key");
	});

	it("SecretStorage missing: throws a readable error, no request", async () => {
		setFrontmatterCache(app.metadataCache, projectFile.path, { repo: "owner/repo", github_token_key: "gh_key" });
		delete (app as any).secretStorage;

		await expect(manager.refreshProject(projectFile as any)).rejects.toThrow(/SecretStorage is not available/);
		expect(requestUrl).not.toHaveBeenCalled();
	});

	it("'(public)' sends an anonymous request without reading a secret", async () => {
		setFrontmatterCache(app.metadataCache, projectFile.path, { repo: "owner/repo", github_token_key: "gh_key" });
		mockGitHubApi({ [RELEASES]: { json: [] } });

		await manager.refreshProject(projectFile as any, "(public)");

		expect(getSecret).not.toHaveBeenCalled();
		const headers = (requestUrl as jest.Mock).mock.calls[0][0].headers ?? {};
		expect(headers.Authorization).toBeUndefined();
	});

	it("anonymous 403 mentions the 60-per-hour limit", async () => {
		setFrontmatterCache(app.metadataCache, projectFile.path, { repo: "owner/repo" });
		mockGitHubApi({ [RELEASES]: { status: 403, json: { message: "rate limit" } } });

		await expect(manager.refreshProject(projectFile as any)).rejects.toThrow(/\(403\): .*60 per hour/);
	});

	it("403 with a PAT says the PAT may lack access", async () => {
		setFrontmatterCache(app.metadataCache, projectFile.path, { repo: "owner/repo", github_token_key: "gh_key" });
		mockGitHubApi({ [RELEASES]: { status: 403, json: { message: "forbidden" } } });

		await expect(manager.refreshProject(projectFile as any)).rejects.toThrow(/\(403\): The PAT may lack access/);
	});

	it("404 with a PAT says the PAT cannot see the repo", async () => {
		setFrontmatterCache(app.metadataCache, projectFile.path, { repo: "owner/repo", github_token_key: "gh_key" });
		mockGitHubApi({ [RELEASES]: { status: 404, json: { message: "Not Found" } } });

		await expect(manager.refreshProject(projectFile as any)).rejects.toThrow(/\(404\): .*PAT cannot see it/);
	});

	it("a network error without a status still names the action", async () => {
		setFrontmatterCache(app.metadataCache, projectFile.path, { repo: "owner/repo", github_token_key: "gh_key" });
		(requestUrl as jest.Mock).mockRejectedValue(new Error("net::ERR_INTERNET_DISCONNECTED"));

		await expect(manager.refreshProject(projectFile as any)).rejects.toThrow(
			/^Listing releases of owner\/repo failed: net::ERR_INTERNET_DISCONNECTED$/
		);
	});

	it("success: shows one summary Notice with the counts", async () => {
		setFrontmatterCache(app.metadataCache, projectFile.path, { repo: "owner/repo", defaultBranch: "main", github_token_key: "gh_key" });
		mockGitHubApi({
			[RELEASES]: { json: [createMockRelease({ tag_name: "v1.0.0" })] },
			"/repos/owner/repo/compare/v1.0.0...main": { json: { total_commits: 0, commits: [] } },
		});

		await manager.refreshProject(projectFile as any);

		const summary = notices().filter((m) => m.startsWith("Synced"));
		expect(summary).toEqual(["Synced 1 releases, 0 unreleased commits."]);
	});

	it("failure: no summary Notice from the manager", async () => {
		setFrontmatterCache(app.metadataCache, projectFile.path, { repo: "owner/repo" });
		mockGitHubApi({ [RELEASES]: { status: 404, json: { message: "Not Found" } } });

		await expect(manager.refreshProject(projectFile as any)).rejects.toThrow();
		expect(notices().some((m) => m.startsWith("Synced"))).toBe(false);
	});
});

describe("verify C3/C1: CodeProjectsModal Refresh button", () => {
	let app: App;

	beforeEach(() => {
		app = createMockApp();
	});

	function renderRefreshButton(refreshProject: jest.Mock) {
		const modal = new CodeProjectsModal(app as any, createMockSettings({ projectRootPath: "Projects" }));
		const project = new TFile("Projects/P/Dashboard.md");
		(modal as any).selectedProject = project;
		(modal as any).manager = { refreshProject, listProjects: jest.fn().mockResolvedValue([project]) };
		const refreshView = jest.fn().mockResolvedValue(undefined);
		(modal as any).refresh = refreshView;
		(modal as any).readFrontmatterFromVault = jest.fn().mockResolvedValue({});
		const container = createFakeElement("div");
		(modal as any).renderActionCards(container);
		const grid = container.children[0];
		const button = grid.children.find((c: any) => c.texts.includes("Refresh"));
		return { button, refreshView };
	}

	it("on failure: shows 'Refresh failed: <message>', does not re-render, no success notice", async () => {
		const refreshProject = jest.fn().mockRejectedValue(new Error("Listing releases of o/r failed (401): GitHub rejected the PAT."));
		const { button, refreshView } = renderRefreshButton(refreshProject);

		await button.onclick();

		expect(notices()).toEqual(["Refresh failed: Listing releases of o/r failed (401): GitHub rejected the PAT."]);
		expect(refreshView).not.toHaveBeenCalled();
		expect(notices().some((m) => /refreshed/i.test(m))).toBe(false);
	});

	it("on success: passes a confirmLegacyCleanup callback and re-renders", async () => {
		const refreshProject = jest.fn().mockResolvedValue({ releases: 0, unreleasedCommits: 0, legacyCommitNotes: 0 });
		const { button, refreshView } = renderRefreshButton(refreshProject);

		await button.onclick();

		expect(refreshProject).toHaveBeenCalledTimes(1);
		const options = refreshProject.mock.calls[0][2];
		expect(typeof options?.confirmLegacyCleanup).toBe("function");
		expect(refreshView).toHaveBeenCalledTimes(1);
		expect(notices().some((m) => /refreshed/i.test(m))).toBe(false);
	});
});
