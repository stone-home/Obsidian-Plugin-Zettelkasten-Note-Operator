/**
 * C3: refreshProject reports problems by throwing an Error with an actionable
 * message instead of showing a Notice and returning; it resolves to a summary
 * on success.
 */

import { App, TFile, requestUrl } from "../../../__mocks__/obsidian";
import {
	createMockApp,
	createMockSettings,
	clearVault,
	createMockCommit,
	createMockRelease,
	mockGitHubApi,
	setFrontmatterCache,
} from "../../../__mocks__/testHelpers";
import { CodeProjectManager } from "../../../service/projects/codeProjectManager";

const RELEASES = "/repos/owner/repo/releases";

describe("CodeProjectManager.refreshProject errors (C3)", () => {
	let app: App;
	let manager: CodeProjectManager;
	let projectFile: TFile;
	let getSecret: jest.Mock;

	const setDashboardCache = (fm: Record<string, any>) => setFrontmatterCache(app.metadataCache, projectFile.path, fm);

	beforeEach(async () => {
		app = createMockApp();
		manager = new CodeProjectManager(app as any, createMockSettings({ projectRootPath: "Projects" }));
		projectFile = (await manager.createProject("ErrProj")) as unknown as TFile;
		getSecret = jest.fn(async (key: string) => (key === "gh_key" ? "tok" : null));
		(app as any).secretStorage = { getSecret };
	});

	afterEach(() => {
		clearVault(app.vault);
	});

	it("throws when the repo field is missing, without any request", async () => {
		setDashboardCache({ defaultBranch: "main" });

		await expect(manager.refreshProject(projectFile as any)).rejects.toThrow(/Missing repo field \(owner\/name\)/);
		expect(requestUrl).not.toHaveBeenCalled();
	});

	it("throws when a PAT key is given but SecretStorage has no secret, without any request", async () => {
		setDashboardCache({ repo: "owner/repo", defaultBranch: "main" });

		await expect(manager.refreshProject(projectFile as any, "missing_key")).rejects.toThrow(
			/No PAT found for key "missing_key"/
		);
		expect(requestUrl).not.toHaveBeenCalled();
	});

	it("explains an anonymous 404 on the release listing", async () => {
		setDashboardCache({ repo: "owner/repo", defaultBranch: "main" });
		mockGitHubApi({ [RELEASES]: { status: 404, json: { message: "Not Found" } } });

		await expect(manager.refreshProject(projectFile as any)).rejects.toThrow(
			/Listing releases of owner\/repo failed \(404\): .*untick Public and pick a PAT/
		);
	});

	it("explains a 401 from GitHub", async () => {
		setDashboardCache({ repo: "owner/repo", defaultBranch: "main", github_token_key: "gh_key" });
		mockGitHubApi({ [RELEASES]: { status: 401, json: { message: "Bad credentials" } } });

		await expect(manager.refreshProject(projectFile as any)).rejects.toThrow(/\(401\): GitHub rejected the PAT/);
	});

	it("reports a failed compare after the releases were synced", async () => {
		setDashboardCache({ repo: "owner/repo", defaultBranch: "main", github_token_key: "gh_key" });
		mockGitHubApi({
			[RELEASES]: { json: [createMockRelease({ tag_name: "v2.0.0" })] },
			"/repos/owner/repo/compare/v2.0.0...main": { status: 404, json: { message: "Not Found" } },
		});

		await expect(manager.refreshProject(projectFile as any)).rejects.toThrow(
			/Synced 1 releases, but comparing v2\.0\.0\.\.\.main failed \(404\): The tag or the branch was not found/
		);
		expect(app.vault.getAbstractFileByPath("Projects/ErrProj/releases/v2.0.0.md")).toBeTruthy();
	});

	it("resolves to a summary with the number of releases and unreleased commits", async () => {
		setDashboardCache({ repo: "owner/repo", defaultBranch: "main", github_token_key: "gh_key" });
		mockGitHubApi({
			[RELEASES]: {
				json: [createMockRelease({ tag_name: "v1.1.0" }), createMockRelease({ tag_name: "v1.0.0" })],
			},
			"/repos/owner/repo/compare/v1.1.0...main": {
				json: {
					total_commits: 3,
					commits: [
						createMockCommit({ sha: "aaaaaaa1111111" }),
						createMockCommit({ sha: "bbbbbbb2222222" }),
						createMockCommit({ sha: "ccccccc3333333" }),
					],
				},
			},
		});

		const summary = await manager.refreshProject(projectFile as any);

		expect(summary).toMatchObject({ releases: 2, unreleasedCommits: 3 });
	});
});
