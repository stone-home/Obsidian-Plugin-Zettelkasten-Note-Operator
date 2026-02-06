/**
 * Tests for ResearchManager
 */

import { App, TFile } from "../../../__mocks__/obsidian";
import {
	createMockApp,
	createMockSettings,
	clearVault,
	extractFrontmatter,
	createResearchDashboardContent,
} from "../../../__mocks__/testHelpers";
import { ResearchManager } from "../../../service/projects/researchManager";
import type { ZettelkastenSettings } from "../../../types";

describe("ResearchManager", () => {
	let app: App;
	let settings: ZettelkastenSettings;
	let manager: ResearchManager;

	beforeEach(() => {
		app = createMockApp();
		settings = createMockSettings({
			researchRootPath: "Research",
			dataviewCodeBlockType: "zettelkasten-query",
		});
		manager = new ResearchManager(app, settings);
	});

	afterEach(() => {
		clearVault(app.vault);
	});

	// ==================== createProject ====================

	describe("createProject", () => {
		it("should create a project with correct folder structure", async () => {
			const projectFile = await manager.createProject("Test Project");

			expect(projectFile).toBeInstanceOf(TFile);
			expect(projectFile.path).toBe("Research/Test Project/Dashboard.md");

			// Verify folder structure was created
			expect(app.vault.getAbstractFileByPath("Research")).toBeTruthy();
			expect(
				app.vault.getAbstractFileByPath("Research/Test Project")
			).toBeTruthy();
			expect(
				app.vault.getAbstractFileByPath("Research/Test Project/objectives")
			).toBeTruthy();
			expect(
				app.vault.getAbstractFileByPath("Research/Test Project/steps")
			).toBeTruthy();
			expect(
				app.vault.getAbstractFileByPath("Research/Test Project/experiments")
			).toBeTruthy();
			expect(
				app.vault.getAbstractFileByPath("Research/Test Project/materials")
			).toBeTruthy();
			expect(
				app.vault.getAbstractFileByPath("Research/Test Project/requirements")
			).toBeTruthy();
		});

		it("should create dashboard with correct frontmatter", async () => {
			await manager.createProject("MyResearch");

			const content = (app.vault as any)._getContent(
				"Research/MyResearch/Dashboard.md"
			);
			const fm = extractFrontmatter(content);

			expect(fm.type).toBe("permanent");
			expect(fm.project_id).toBe("myresearch");
			expect(fm.project_name).toBe("MyResearch");
			expect(fm.status).toBe("active");
		});

		it("should sanitize project name with special characters", async () => {
			const projectFile = await manager.createProject("Test/Project\\Name");

			expect(projectFile.path).toBe("Research/Test-Project-Name/Dashboard.md");
		});

		it("should throw error for empty project name", async () => {
			await expect(manager.createProject("")).rejects.toThrow(
				"Project name is required."
			);
		});

		it("should throw error for whitespace-only project name", async () => {
			await expect(manager.createProject("   ")).rejects.toThrow(
				"Project name is required."
			);
		});

		it("should return existing dashboard if project already exists", async () => {
			const firstFile = await manager.createProject("Existing Project");
			const secondFile = await manager.createProject("Existing Project");

			expect(firstFile.path).toBe(secondFile.path);
		});

		it("should use custom research root path from settings", async () => {
			const customSettings = createMockSettings({
				researchRootPath: "My/Research/Folder",
			});
			const customManager = new ResearchManager(app, customSettings);

			const projectFile = await customManager.createProject("Test");

			expect(projectFile.path).toBe("My/Research/Folder/Test/Dashboard.md");
		});
	});

	// ==================== createObjective ====================

	describe("createObjective", () => {
		let projectFile: TFile;

		beforeEach(async () => {
			projectFile = await manager.createProject("TestProject");
		});

		it("should create objective with correct frontmatter", async () => {
			const objectiveFile = await manager.createObjective(
				projectFile,
				"FirstObjective"
			);

			expect(objectiveFile).toBeInstanceOf(TFile);
			expect(objectiveFile.path).toBe(
				"Research/TestProject/objectives/FirstObjective.md"
			);

			const content = (app.vault as any)._getContent(objectiveFile.path);
			const fm = extractFrontmatter(content);

			expect(fm.title).toBe("FirstObjective");
			expect(fm.status).toBe("planned");
		});

		it("should include project link in frontmatter", async () => {
			const objectiveFile = await manager.createObjective(
				projectFile,
				"LinkedObjective"
			);

			const content = (app.vault as any)._getContent(objectiveFile.path);
			expect(content).toContain("[[Research/TestProject/Dashboard|Dashboard]]");
		});

		it("should throw error if objective already exists", async () => {
			await manager.createObjective(projectFile, "Duplicate");

			await expect(
				manager.createObjective(projectFile, "Duplicate")
			).rejects.toThrow("Objective already exists.");
		});

		it("should sanitize objective title", async () => {
			const objectiveFile = await manager.createObjective(
				projectFile,
				"Test/Objective\\Name"
			);

			expect(objectiveFile.path).toBe(
				"Research/TestProject/objectives/Test-Objective-Name.md"
			);
		});
	});

	// ==================== createStep ====================

	describe("createStep", () => {
		let projectFile: TFile;
		let objectiveFile: TFile;

		beforeEach(async () => {
			projectFile = await manager.createProject("StepTestProject");
			objectiveFile = await manager.createObjective(projectFile, "TestObjective");
		});

		it("should create step with correct frontmatter", async () => {
			const stepFile = await manager.createStep(
				projectFile,
				objectiveFile,
				"FirstStep"
			);

			expect(stepFile).toBeInstanceOf(TFile);
			expect(stepFile.path).toBe(
				"Research/StepTestProject/steps/FirstStep.md"
			);

			const content = (app.vault as any)._getContent(stepFile.path);
			const fm = extractFrontmatter(content);

			expect(fm.title).toBe("FirstStep");
			expect(fm.status).toBe("todo");
		});

		it("should include project and objective links", async () => {
			const stepFile = await manager.createStep(
				projectFile,
				objectiveFile,
				"LinkedStep"
			);

			const content = (app.vault as any)._getContent(stepFile.path);
			expect(content).toContain("[[Research/StepTestProject/Dashboard|Dashboard]]");
			expect(content).toContain("[[Research/StepTestProject/objectives/TestObjective]]");
		});

		it("should throw error if step already exists", async () => {
			await manager.createStep(projectFile, objectiveFile, "DuplicateStep");

			await expect(
				manager.createStep(projectFile, objectiveFile, "DuplicateStep")
			).rejects.toThrow("Step already exists.");
		});
	});

	// ==================== createExperiment ====================

	describe("createExperiment", () => {
		let projectFile: TFile;

		beforeEach(async () => {
			projectFile = await manager.createProject("ExperimentProject");
		});

		it("should create experiment with correct frontmatter", async () => {
			const experimentFile = await manager.createExperiment(
				projectFile,
				"FirstExperiment"
			);

			expect(experimentFile).toBeInstanceOf(TFile);
			expect(experimentFile.path).toBe(
				"Research/ExperimentProject/experiments/FirstExperiment.md"
			);

			const content = (app.vault as any)._getContent(experimentFile.path);
			const fm = extractFrontmatter(content);

			expect(fm.title).toBe("FirstExperiment");
			expect(fm.status).toBe("planned");
		});

		it("should throw error if experiment already exists", async () => {
			await manager.createExperiment(projectFile, "Duplicate");

			await expect(
				manager.createExperiment(projectFile, "Duplicate")
			).rejects.toThrow("Experiment already exists.");
		});
	});

	// ==================== createRequirement ====================

	describe("createRequirement", () => {
		let projectFile: TFile;

		beforeEach(async () => {
			projectFile = await manager.createProject("RequirementProject");
		});

		it("should create requirement with correct frontmatter", async () => {
			const requirementFile = await manager.createRequirement(
				projectFile,
				"FirstRequirement"
			);

			expect(requirementFile).toBeInstanceOf(TFile);
			expect(requirementFile.path).toBe(
				"Research/RequirementProject/requirements/FirstRequirement.md"
			);

			const content = (app.vault as any)._getContent(requirementFile.path);
			const fm = extractFrontmatter(content);

			expect(fm.title).toBe("FirstRequirement");
			expect(fm.status).toBe("proposed");
			expect(fm.priority).toBe("medium");
		});

		it("should throw error if requirement already exists", async () => {
			await manager.createRequirement(projectFile, "Duplicate");

			await expect(
				manager.createRequirement(projectFile, "Duplicate")
			).rejects.toThrow("Requirement already exists.");
		});
	});

	// ==================== listProjects ====================

	describe("listProjects", () => {
		it("should return empty array when no projects exist", async () => {
			const projects = await manager.listProjects();
			expect(projects).toEqual([]);
		});

		it("should return all project dashboards", async () => {
			await manager.createProject("ProjectOne");
			await manager.createProject("ProjectTwo");
			await manager.createProject("ProjectThree");

			const projects = await manager.listProjects();

			expect(projects).toHaveLength(3);
			expect(projects.map((p) => p.path)).toContain(
				"Research/ProjectOne/Dashboard.md"
			);
			expect(projects.map((p) => p.path)).toContain(
				"Research/ProjectTwo/Dashboard.md"
			);
			expect(projects.map((p) => p.path)).toContain(
				"Research/ProjectThree/Dashboard.md"
			);
		});

		it("should not return files outside research root", async () => {
			await manager.createProject("ValidProject");
			// Create a file outside research root
			await app.vault.create("Other/Dashboard.md", "content");

			const projects = await manager.listProjects();

			expect(projects).toHaveLength(1);
			expect(projects[0].path).toBe("Research/ValidProject/Dashboard.md");
		});
	});

	// ==================== listObjectives ====================

	describe("listObjectives", () => {
		let projectFile: TFile;

		beforeEach(async () => {
			projectFile = await manager.createProject("ObjectiveListProject");
		});

		it("should return empty array when no objectives exist", () => {
			const objectives = manager.listObjectives(projectFile);
			expect(objectives).toEqual([]);
		});

		it("should return all objectives for a project", async () => {
			await manager.createObjective(projectFile, "ObjectiveA");
			await manager.createObjective(projectFile, "ObjectiveB");

			const objectives = manager.listObjectives(projectFile);

			expect(objectives).toHaveLength(2);
			expect(objectives.map((o) => o.name)).toContain("ObjectiveA.md");
			expect(objectives.map((o) => o.name)).toContain("ObjectiveB.md");
		});
	});

	// ==================== importExistingProject ====================

	describe("importExistingProject", () => {
		it("should create dashboard for existing folder", async () => {
			// Create folder structure manually
			await app.vault.createFolder("Research/Existing");

			const dashboardFile = await manager.importExistingProject(
				"Research/Existing"
			);

			expect(dashboardFile.path).toBe("Research/Existing/Dashboard.md");
		});

		it("should return existing dashboard if already exists", async () => {
			// First import
			const first = await manager.importExistingProject("Research/ImportTest");
			// Second import
			const second = await manager.importExistingProject("Research/ImportTest");

			expect(first.path).toBe(second.path);
		});

		it("should create all subfolders", async () => {
			await manager.importExistingProject("Research/NewImport");

			expect(
				app.vault.getAbstractFileByPath("Research/NewImport/objectives")
			).toBeTruthy();
			expect(
				app.vault.getAbstractFileByPath("Research/NewImport/steps")
			).toBeTruthy();
			expect(
				app.vault.getAbstractFileByPath("Research/NewImport/experiments")
			).toBeTruthy();
			expect(
				app.vault.getAbstractFileByPath("Research/NewImport/materials")
			).toBeTruthy();
			expect(
				app.vault.getAbstractFileByPath("Research/NewImport/requirements")
			).toBeTruthy();
		});
	});

	// ==================== updateDashboardProperties ====================

	describe("updateDashboardProperties", () => {
		it("should do nothing when file does not exist", async () => {
			await manager.updateDashboardProperties("Research/Nonexistent/Dashboard.md", {
				github_token_key: "key",
			});
			expect(app.vault.getAbstractFileByPath("Research/Nonexistent/Dashboard.md")).toBeFalsy();
		});

		it("should update github_token_key in dashboard frontmatter", async () => {
			const projectFile = await manager.createProject("UpdateProject");
			await manager.updateDashboardProperties(projectFile.path, {
				github_token_key: "my-token-key",
			});
			const content = (app.vault as any)._getContent(projectFile.path);
			const fm = extractFrontmatter(content);
			expect(fm.github_token_key).toBe("my-token-key");
		});

		it("should update public_repo boolean", async () => {
			const projectFile = await manager.createProject("PublicProject");
			await manager.updateDashboardProperties(projectFile.path, {
				public_repo: true,
			});
			const content = (app.vault as any)._getContent(projectFile.path);
			const fm = extractFrontmatter(content);
			expect(fm.public_repo).toBe(true);
		});

		it("should update repo string", async () => {
			const projectFile = await manager.createProject("RepoProject");
			await manager.updateDashboardProperties(projectFile.path, {
				repo: "owner/repo",
			});
			const content = (app.vault as any)._getContent(projectFile.path);
			const fm = extractFrontmatter(content);
			expect(fm.repo).toBe("owner/repo");
		});

		it("should update multiple properties at once", async () => {
			const projectFile = await manager.createProject("MultiUpdate");
			await manager.updateDashboardProperties(projectFile.path, {
				github_token_key: "key",
				public_repo: false,
				repo: "user/research",
			});
			const content = (app.vault as any)._getContent(projectFile.path);
			const fm = extractFrontmatter(content);
			expect(fm.github_token_key).toBe("key");
			expect(fm.public_repo).toBe(false);
			expect(fm.repo).toBe("user/research");
		});

		it("should do nothing when file has no frontmatter block", async () => {
			await app.vault.createFolder("Research");
			await (app.vault as any).create(
				"Research/NoFm/Dashboard.md",
				"no frontmatter here\njust content"
			);
			await manager.updateDashboardProperties("Research/NoFm/Dashboard.md", {
				repo: "x/y",
			});
			const content = (app.vault as any)._getContent("Research/NoFm/Dashboard.md");
			expect(content).toBe("no frontmatter here\njust content");
		});
	});
});
