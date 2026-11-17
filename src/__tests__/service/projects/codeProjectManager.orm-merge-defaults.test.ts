/**
 * With the ORM in the real library's merge mode, CodeProjectManager gives every release note its own url, date and subtype tag on the first refresh, and new requirements keep the status and priority passed in.
 */

import type { TFile } from "obsidian";
import { App } from "../../../__mocks__/obsidian";
import { setOrmMergeMode } from "../../../__mocks__/markdown-note-orm";
import {
	asObsidianApp,
	createMockApp,
	createMockSettings,
	clearVault,
	createMockRelease,
	mockGitHubApi,
	parseNoteFrontmatter,
	setFrontmatterCache,
} from "../../../__mocks__/testHelpers";
import { CodeProjectManager } from "../../../service/projects/codeProjectManager";

describe("CodeProjectManager with the real ORM merge mode", () => {
	let app: App;
	let manager: CodeProjectManager;
	let projectFile: TFile;

	beforeEach(async () => {
		setOrmMergeMode("preserve-existing");
		app = createMockApp();
		manager = new CodeProjectManager(
			asObsidianApp(app),
			createMockSettings({ projectRootPath: "Projects" })
		);
		projectFile = await manager.createProject("RelProj");
		setFrontmatterCache(app.metadataCache, projectFile.path, {
			repo: "owner/repo",
			defaultBranch: "main",
		});
	});

	afterEach(() => {
		setOrmMergeMode("override");
		clearVault(app.vault);
	});

	it("first refresh: every release note gets its own url, date and the subtype tag", async () => {
		mockGitHubApi({
			"/repos/owner/repo/releases": {
				json: [
					createMockRelease({
						tag_name: "v2.0.0",
						html_url: "https://github.com/owner/repo/releases/tag/v2.0.0",
						published_at: "2026-11-01T00:00:00Z",
					}),
					createMockRelease({
						tag_name: "v1.0.0",
						html_url: "https://github.com/owner/repo/releases/tag/v1.0.0",
						published_at: "2026-10-01T00:00:00Z",
					}),
				],
			},
			"/repos/owner/repo/compare/v2.0.0...main": {
				json: { total_commits: 0, commits: [] },
			},
		});

		await manager.refreshProject(projectFile, "(public)");

		for (const tag of ["v2.0.0", "v1.0.0"]) {
			const fm = parseNoteFrontmatter(
				app.vault._getContent(`Projects/RelProj/releases/${tag}.md`)
			);
			expect(fm.url).toBe(`https://github.com/owner/repo/releases/tag/${tag}`);
			expect(fm.version).toBe(tag);
			expect(fm.tags).toEqual(expect.arrayContaining(["type/project-release"]));
		}
	});

	it("requirements created with real ORM defaults keep the passed status and priority", async () => {
		const file = await manager.createRequirement(projectFile, "Login");

		const fm = parseNoteFrontmatter(app.vault._getContent(file.path));
		expect(fm.status).toBe("proposed");
		expect(fm.priority).toBe("medium");
		expect(fm.tags).toEqual(expect.arrayContaining(["type/code-requirement"]));
	});
});
