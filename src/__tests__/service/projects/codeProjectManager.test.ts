/**
 * Tests for CodeProjectManager
 */

import { App, TFile, requestUrl } from "../../../__mocks__/obsidian";
import {
	createMockApp,
	createMockSettings,
	clearVault,
	extractFrontmatter,
	mockRequestUrl,
	resetRequestUrlMock,
	createMockRelease,
	createMockCommit,
	setFrontmatterCache,
	createCodeDashboardContent,
} from "../../../__mocks__/testHelpers";
import { CodeProjectManager } from "../../../service/projects/codeProjectManager";
import type { ZettelkastenSettings } from "../../../types";

describe("CodeProjectManager", () => {
	let app: App;
	let settings: ZettelkastenSettings;
	let manager: CodeProjectManager;

	beforeEach(() => {
		app = createMockApp();
		settings = createMockSettings({
			projectRootPath: "Projects",
			dataviewCodeBlockType: "zettelkasten-query",
		});
		manager = new CodeProjectManager(app, settings);
		resetRequestUrlMock();
	});

	afterEach(() => {
		clearVault(app.vault);
	});

	// ==================== createProject ====================

	describe("createProject", () => {
		it("should create a project with correct folder structure", async () => {
			const projectFile = await manager.createProject("MyPlugin");

			expect(projectFile).toBeInstanceOf(TFile);
			expect(projectFile.path).toBe("Projects/MyPlugin/Dashboard.md");

			// Verify folder structure
			expect(app.vault.getAbstractFileByPath("Projects")).toBeTruthy();
			expect(app.vault.getAbstractFileByPath("Projects/MyPlugin")).toBeTruthy();
			expect(
				app.vault.getAbstractFileByPath("Projects/MyPlugin/releases")
			).toBeTruthy();
			expect(
				app.vault.getAbstractFileByPath("Projects/MyPlugin/commits")
			).toBeTruthy();
			expect(
				app.vault.getAbstractFileByPath("Projects/MyPlugin/requirements")
			).toBeTruthy();
		});

		it("should create dashboard with correct frontmatter", async () => {
			await manager.createProject("TestProject");

			const content = (app.vault as any)._getContent(
				"Projects/TestProject/Dashboard.md"
			);
			const fm = extractFrontmatter(content);

			expect(fm.type).toBe("permanent");
			expect(fm.project_name).toBe("TestProject");
			expect(fm.repo).toBe("owner/name");
			expect(fm.defaultBranch).toBe("trunk");
			expect(fm.public_repo).toBe(true);
		});

		it("should sanitize project name", async () => {
			const projectFile = await manager.createProject("Test/Project\\Name");
			expect(projectFile.path).toBe("Projects/Test-Project-Name/Dashboard.md");
		});

		it("should throw error for empty project name", async () => {
			await expect(manager.createProject("")).rejects.toThrow(
				"Project name is required."
			);
		});

		it("should return existing dashboard if project exists", async () => {
			const first = await manager.createProject("Existing");
			const second = await manager.createProject("Existing");
			expect(first.path).toBe(second.path);
		});

		it("should use custom project root path", async () => {
			const customSettings = createMockSettings({
				projectRootPath: "Code/Projects",
			});
			const customManager = new CodeProjectManager(app, customSettings);

			const projectFile = await customManager.createProject("Test");
			expect(projectFile.path).toBe("Code/Projects/Test/Dashboard.md");
		});
	});

	// ==================== createRequirement ====================

	describe("createRequirement", () => {
		let projectFile: TFile;

		beforeEach(async () => {
			projectFile = await manager.createProject("ReqTest");
		});

		it("should create requirement with correct frontmatter", async () => {
			const reqFile = await manager.createRequirement(
				projectFile,
				"NewFeature"
			);

			expect(reqFile).toBeInstanceOf(TFile);
			expect(reqFile.path).toBe(
				"Projects/ReqTest/requirements/NewFeature.md"
			);

			const content = (app.vault as any)._getContent(reqFile.path);
			const fm = extractFrontmatter(content);

			expect(fm.title).toBe("NewFeature");
			expect(fm.status).toBe("proposed");
			expect(fm.priority).toBe("medium");
		});

		it("should include release field for linking", async () => {
			const reqFile = await manager.createRequirement(
				projectFile,
				"FeatureWithRelease"
			);

			const content = (app.vault as any)._getContent(reqFile.path);
			expect(content).toContain("release:");
		});

		it("should throw error if requirement exists", async () => {
			await manager.createRequirement(projectFile, "Duplicate");

			await expect(
				manager.createRequirement(projectFile, "Duplicate")
			).rejects.toThrow("Requirement already exists.");
		});
	});

	// ==================== updateDashboardProperties ====================

	describe("updateDashboardProperties", () => {
		let projectFile: TFile;

		beforeEach(async () => {
			projectFile = await manager.createProject("UpdateTest");
		});

		it("should update github_token_key property", async () => {
			await manager.updateDashboardProperties(projectFile.path, {
				github_token_key: "my_custom_token",
			});

			const content = (app.vault as any)._getContent(projectFile.path);
			expect(content).toContain("github_token_key: my_custom_token");
		});

		it("should update public_repo property", async () => {
			await manager.updateDashboardProperties(projectFile.path, {
				public_repo: true,
			});

			const content = (app.vault as any)._getContent(projectFile.path);
			expect(content).toContain("public_repo: true");
		});

		it("should update multiple properties at once", async () => {
			await manager.updateDashboardProperties(projectFile.path, {
				github_token_key: "new_token",
				public_repo: true,
			});

			const content = (app.vault as any)._getContent(projectFile.path);
			expect(content).toContain("github_token_key: new_token");
			expect(content).toContain("public_repo: true");
		});

		it("should add property if it does not exist", async () => {
			// Create a dashboard without public_repo
			const customContent = [
				"---",
				"type: permanent",
				"project_name: Test",
				"repo: owner/name",
				"---",
				"",
				"# Dashboard",
			].join("\n");

			await app.vault.create("Projects/Custom/Dashboard.md", customContent);

			await manager.updateDashboardProperties("Projects/Custom/Dashboard.md", {
				public_repo: true,
			});

			const content = (app.vault as any)._getContent(
				"Projects/Custom/Dashboard.md"
			);
			expect(content).toContain("public_repo: true");
		});

		it("should do nothing if file does not exist", async () => {
			// Should not throw
			await expect(
				manager.updateDashboardProperties("NonExistent/Dashboard.md", {
					public_repo: true,
				})
			).resolves.not.toThrow();
		});
	});

	// ==================== listProjects ====================

	describe("listProjects", () => {
		it("should return empty array when no projects exist", async () => {
			const projects = await manager.listProjects();
			expect(projects).toEqual([]);
		});

		it("should return all project dashboards", async () => {
			await manager.createProject("ProjectA");
			await manager.createProject("ProjectB");

			const projects = await manager.listProjects();

			expect(projects).toHaveLength(2);
			expect(projects.map((p) => p.path)).toContain(
				"Projects/ProjectA/Dashboard.md"
			);
			expect(projects.map((p) => p.path)).toContain(
				"Projects/ProjectB/Dashboard.md"
			);
		});
	});

	// ==================== refreshProject ====================

	describe("refreshProject", () => {
		let projectFile: TFile;

		beforeEach(async () => {
			projectFile = await manager.createProject("RefreshTest");

			// Set up metadata cache with repo info
			setFrontmatterCache(app.metadataCache, projectFile.path, {
				repo: "owner/repo",
				defaultBranch: "main",
				github_token_key: "test_token",
			});

			// Mock secretStorage
			(app as any).secretStorage = {
				getSecret: jest.fn().mockResolvedValue("mock-token"),
			};
		});

		it("should fetch releases from GitHub API", async () => {
			const mockReleases = [
				createMockRelease({ tag_name: "v1.0.0" }),
				createMockRelease({ tag_name: "v0.9.0" }),
			];

			mockRequestUrl({ json: mockReleases });

			await manager.refreshProject(projectFile);

			expect(requestUrl).toHaveBeenCalledWith(
				expect.objectContaining({
					url: "https://api.github.com/repos/owner/repo/releases",
				})
			);
		});

		it("should create release notes", async () => {
			const mockReleases = [
				createMockRelease({
					tag_name: "v1.0.0",
					body: "First release",
					published_at: "2024-01-01T00:00:00Z",
				}),
			];

			mockRequestUrl({ json: mockReleases });

			await manager.refreshProject(projectFile);

			const releaseFile = app.vault.getAbstractFileByPath(
				"Projects/RefreshTest/releases/v1.0.0.md"
			);
			expect(releaseFile).toBeTruthy();
		});

		it("should compare commits after latest release", async () => {
			const mockReleases = [createMockRelease({ tag_name: "v1.0.0" })];
			const mockCompare = {
				commits: [
					createMockCommit({ sha: "abc1234", message: "New feature" }),
				],
			};

			// First call returns releases, second returns compare
			(requestUrl as jest.Mock)
				.mockResolvedValueOnce({
					status: 200,
					headers: {},
					json: mockReleases,
				})
				.mockResolvedValueOnce({
					status: 200,
					headers: {},
					json: mockCompare,
				});

			await manager.refreshProject(projectFile);

			expect(requestUrl).toHaveBeenCalledWith(
				expect.objectContaining({
					url: "https://api.github.com/repos/owner/repo/compare/v1.0.0...main",
				})
			);
		});

		it("should create commit notes for unreleased commits", async () => {
			const mockReleases = [createMockRelease({ tag_name: "v1.0.0" })];
			const mockCompare = {
				commits: [
					createMockCommit({ sha: "abc1234567890", message: "New feature" }),
				],
			};

			(requestUrl as jest.Mock)
				.mockResolvedValueOnce({
					status: 200,
					headers: {},
					json: mockReleases,
				})
				.mockResolvedValueOnce({
					status: 200,
					headers: {},
					json: mockCompare,
				});

			await manager.refreshProject(projectFile);

			const commitFile = app.vault.getAbstractFileByPath(
				"Projects/RefreshTest/commits/abc1234.md"
			);
			expect(commitFile).toBeTruthy();
		});

		it("should work with public repo (no token)", async () => {
			setFrontmatterCache(app.metadataCache, projectFile.path, {
				repo: "owner/public-repo",
				defaultBranch: "main",
			});

			mockRequestUrl({ json: [] });

			await manager.refreshProject(projectFile, "(public)");

			expect(requestUrl).toHaveBeenCalledWith(
				expect.objectContaining({
					headers: expect.not.objectContaining({
						Authorization: expect.any(String),
					}),
				})
			);
		});
	});

	// ==================== importExistingProject ====================

	describe("importExistingProject", () => {
		it("should create dashboard for existing folder", async () => {
			await app.vault.createFolder("Projects/Existing");

			const dashboardFile = await manager.importExistingProject(
				"Projects/Existing"
			);

			expect(dashboardFile.path).toBe("Projects/Existing/Dashboard.md");
		});

		it("should return existing dashboard", async () => {
			const first = await manager.importExistingProject("Projects/Import");
			const second = await manager.importExistingProject("Projects/Import");

			expect(first.path).toBe(second.path);
		});

		it("should create all subfolders", async () => {
			await manager.importExistingProject("Projects/NewImport");

			expect(
				app.vault.getAbstractFileByPath("Projects/NewImport/releases")
			).toBeTruthy();
			expect(
				app.vault.getAbstractFileByPath("Projects/NewImport/commits")
			).toBeTruthy();
			expect(
				app.vault.getAbstractFileByPath("Projects/NewImport/requirements")
			).toBeTruthy();
		});
	});
});
