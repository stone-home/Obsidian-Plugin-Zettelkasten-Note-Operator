/**
 * C8: a release note created on the first refresh carries the release URL.
 * The real markdown-note-orm seeds `url: ""` for permanent notes and keeps
 * existing scalars when template properties are applied, so passing `url`
 * through the template alone loses it. The ORM mock's "preserve-existing"
 * mode reproduces that.
 */

import { App, TFile } from "../../../__mocks__/obsidian";
import { setOrmMergeMode } from "../../../__mocks__/markdown-note-orm";
import {
	createMockApp,
	createMockSettings,
	clearVault,
	createMockRelease,
	mockGitHubApi,
	parseNoteFrontmatter,
	setFrontmatterCache,
} from "../../../__mocks__/testHelpers";
import { CodeProjectManager } from "../../../service/projects/codeProjectManager";

describe("CodeProjectManager release notes keep the release URL (C8)", () => {
	let app: App;
	let manager: CodeProjectManager;
	let projectFile: TFile;

	beforeEach(async () => {
		setOrmMergeMode("preserve-existing");
		app = createMockApp();
		manager = new CodeProjectManager(app as any, createMockSettings({ projectRootPath: "Projects" }));
		projectFile = (await manager.createProject("RelProj")) as unknown as TFile;
		setFrontmatterCache(app.metadataCache, projectFile.path, {
			repo: "owner/repo",
			defaultBranch: "main",
			github_token_key: "gh_key",
		});
		(app as any).secretStorage = { getSecret: jest.fn().mockResolvedValue("tok") };
	});

	afterEach(() => {
		setOrmMergeMode("override");
		clearVault(app.vault);
	});

	it("writes url and version into releases/v1.0.0.md on the first refresh", async () => {
		const release = createMockRelease({
			tag_name: "v1.0.0",
			html_url: "https://github.com/owner/repo/releases/tag/v1.0.0",
		});
		mockGitHubApi({
			"/repos/owner/repo/releases": { json: [release] },
			"/repos/owner/repo/compare/v1.0.0...main": { json: { total_commits: 0, commits: [] } },
		});

		await manager.refreshProject(projectFile as any);

		const content = (app.vault as any)._getContent("Projects/RelProj/releases/v1.0.0.md");
		expect(content).toBeDefined();
		const fm = parseNoteFrontmatter(content);
		expect(fm.url).toBe("https://github.com/owner/repo/releases/tag/v1.0.0");
		expect(fm.version).toBe("v1.0.0");
	});
});
