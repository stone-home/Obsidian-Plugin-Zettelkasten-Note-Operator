/**
 * CodeProjectManager.refreshProject fails with a readable error, and sends no anonymous request, when the PAT is missing or GitHub refuses; on success it shows one summary notice.
 */

import type { TFile } from "obsidian";
import { App, requestUrl } from "../../../__mocks__/obsidian";
import {
	asObsidianApp,
	clearNotices,
	clearVault,
	createMockApp,
	createMockRelease,
	createMockSettings,
	mockFileOf,
	mockGitHubApi,
	noticeMessages,
	parseNoteFrontmatter,
	setFrontmatterCache,
} from "../../../__mocks__/testHelpers";
import { CodeProjectManager } from "../../../service/projects/codeProjectManager";

const RELEASES = "/repos/owner/repo/releases";

const notices = () => noticeMessages();

beforeEach(() => {
	clearNotices();
});

describe("CodeProjectManager.refreshProject error paths", () => {
	let app: App;
	let manager: CodeProjectManager;
	let projectFile: TFile;
	let getSecret: jest.Mock<Promise<string | null>, [string]>;

	beforeEach(async () => {
		app = createMockApp();
		manager = new CodeProjectManager(
			asObsidianApp(app),
			createMockSettings({ projectRootPath: "Projects" })
		);
		projectFile = await manager.createProject("ErrProj");
		getSecret = jest.fn(async (key: string) => (key === "gh_key" ? "tok" : null));
		app.secretStorage = { getSecret };
	});

	afterEach(() => clearVault(app.vault));

	it("PAT key taken from the dashboard (no tokenKey argument) without a secret: throws, no request", async () => {
		setFrontmatterCache(app.metadataCache, projectFile.path, {
			repo: "owner/repo",
			github_token_key: "gone_key",
		});

		await expect(manager.refreshProject(projectFile)).rejects.toThrow(
			/No PAT found for key "gone_key"/
		);
		expect(requestUrl).not.toHaveBeenCalled();
	});

	it("getSecret throwing is reported as a missing PAT, no request", async () => {
		setFrontmatterCache(app.metadataCache, projectFile.path, {
			repo: "owner/repo",
			github_token_key: "gh_key",
		});
		getSecret.mockRejectedValue(new Error("keychain locked"));

		await expect(manager.refreshProject(projectFile)).rejects.toThrow(
			/No PAT found for key "gh_key"/
		);
		expect(requestUrl).not.toHaveBeenCalled();
	});

	it("a missing PAT does not overwrite github_token_key on the dashboard", async () => {
		await app.vault.modify(
			mockFileOf(projectFile),
			"---\nrepo: owner/repo\ngithub_token_key: gh_key\n---\n"
		);
		setFrontmatterCache(app.metadataCache, projectFile.path, {
			repo: "owner/repo",
			github_token_key: "gh_key",
		});

		await expect(
			manager.refreshProject(projectFile, "missing_key")
		).rejects.toThrow();

		const fm = parseNoteFrontmatter(app.vault._getContent(projectFile.path));
		expect(fm.github_token_key).toBe("gh_key");
	});

	it("SecretStorage missing: throws a readable error, no request", async () => {
		setFrontmatterCache(app.metadataCache, projectFile.path, {
			repo: "owner/repo",
			github_token_key: "gh_key",
		});
		delete app.secretStorage;

		await expect(manager.refreshProject(projectFile)).rejects.toThrow(
			/SecretStorage is not available/
		);
		expect(requestUrl).not.toHaveBeenCalled();
	});

	it("'(public)' sends an anonymous request without reading a secret", async () => {
		setFrontmatterCache(app.metadataCache, projectFile.path, {
			repo: "owner/repo",
			github_token_key: "gh_key",
		});
		mockGitHubApi({ [RELEASES]: { json: [] } });

		await manager.refreshProject(projectFile, "(public)");

		expect(getSecret).not.toHaveBeenCalled();
		const headers = requestUrl.mock.calls[0][0].headers ?? {};
		expect(headers.Authorization).toBeUndefined();
	});

	it("anonymous 403 mentions the 60-per-hour limit", async () => {
		setFrontmatterCache(app.metadataCache, projectFile.path, {
			repo: "owner/repo",
		});
		mockGitHubApi({ [RELEASES]: { status: 403, json: { message: "rate limit" } } });

		await expect(manager.refreshProject(projectFile)).rejects.toThrow(
			/\(403\): .*60 per hour/
		);
	});

	it("403 with a PAT says the PAT may lack access", async () => {
		setFrontmatterCache(app.metadataCache, projectFile.path, {
			repo: "owner/repo",
			github_token_key: "gh_key",
		});
		mockGitHubApi({ [RELEASES]: { status: 403, json: { message: "forbidden" } } });

		await expect(manager.refreshProject(projectFile)).rejects.toThrow(
			/\(403\): The PAT may lack access/
		);
	});

	it("404 with a PAT says the PAT cannot see the repo", async () => {
		setFrontmatterCache(app.metadataCache, projectFile.path, {
			repo: "owner/repo",
			github_token_key: "gh_key",
		});
		mockGitHubApi({ [RELEASES]: { status: 404, json: { message: "Not Found" } } });

		await expect(manager.refreshProject(projectFile)).rejects.toThrow(
			/\(404\): .*PAT cannot see it/
		);
	});

	it("a network error without a status still names the action", async () => {
		setFrontmatterCache(app.metadataCache, projectFile.path, {
			repo: "owner/repo",
			github_token_key: "gh_key",
		});
		requestUrl.mockRejectedValue(new Error("net::ERR_INTERNET_DISCONNECTED"));

		await expect(manager.refreshProject(projectFile)).rejects.toThrow(
			/^Listing releases of owner\/repo failed: net::ERR_INTERNET_DISCONNECTED$/
		);
	});

	it("success: shows one summary Notice with the counts", async () => {
		setFrontmatterCache(app.metadataCache, projectFile.path, {
			repo: "owner/repo",
			defaultBranch: "main",
			github_token_key: "gh_key",
		});
		mockGitHubApi({
			[RELEASES]: { json: [createMockRelease({ tag_name: "v1.0.0" })] },
			"/repos/owner/repo/compare/v1.0.0...main": {
				json: { total_commits: 0, commits: [] },
			},
		});

		await manager.refreshProject(projectFile);

		const summary = notices().filter((m) => m.startsWith("Synced"));
		expect(summary).toEqual(["Synced 1 releases, 0 unreleased commits."]);
	});

	it("failure: no summary Notice from the manager", async () => {
		setFrontmatterCache(app.metadataCache, projectFile.path, {
			repo: "owner/repo",
		});
		mockGitHubApi({ [RELEASES]: { status: 404, json: { message: "Not Found" } } });

		await expect(manager.refreshProject(projectFile)).rejects.toThrow();
		expect(notices().some((m) => m.startsWith("Synced"))).toBe(false);
	});
});
