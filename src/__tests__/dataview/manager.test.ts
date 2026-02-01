/**
 * Tests for DataviewJSManager
 */

import { App, TFile } from "../../__mocks__/obsidian";
import {
	createMockApp,
	clearVault,
	populateVault,
} from "../../__mocks__/testHelpers";
import { DataviewJSManager } from "../../dataview/manager";

describe("DataviewJSManager", () => {
	let app: App;
	let manager: DataviewJSManager;
	const scriptsFolder = "dataview-scripts";

	beforeEach(() => {
		app = createMockApp();
		manager = new DataviewJSManager(app, scriptsFolder);
	});

	afterEach(() => {
		clearVault(app.vault);
	});

	// ==================== Initialization ====================

	describe("initialization", () => {
		it("should create scripts folder if not exists", async () => {
			await manager.onload();

			const folder = app.vault.getAbstractFileByPath(scriptsFolder);
			expect(folder).toBeTruthy();
		});

		it("should not fail if scripts folder already exists", async () => {
			await app.vault.createFolder(scriptsFolder);

			await expect(manager.onload()).resolves.not.toThrow();
		});

		it("should use custom scripts folder path", async () => {
			const customManager = new DataviewJSManager(app, "custom/scripts");
			await customManager.onload();

			const folder = app.vault.getAbstractFileByPath("custom/scripts");
			expect(folder).toBeTruthy();
		});
	});

	// ==================== Default Scripts ====================

	describe("createDefaultScripts", () => {
		it("should create research quick actions script", async () => {
			await manager.onload();

			const scriptFile = app.vault.getAbstractFileByPath(
				`${scriptsFolder}/zk-research-quick-actions.js`
			);
			expect(scriptFile).toBeTruthy();
		});

		it("should create research gantt script", async () => {
			await manager.onload();

			const scriptFile = app.vault.getAbstractFileByPath(
				`${scriptsFolder}/zk-research-gantt.js`
			);
			expect(scriptFile).toBeTruthy();
		});

		it("should create project quick actions script", async () => {
			await manager.onload();

			const scriptFile = app.vault.getAbstractFileByPath(
				`${scriptsFolder}/zk-project-quick-actions.js`
			);
			expect(scriptFile).toBeTruthy();
		});

		it("should create project requirements script", async () => {
			await manager.onload();

			const scriptFile = app.vault.getAbstractFileByPath(
				`${scriptsFolder}/zk-project-requirements.js`
			);
			expect(scriptFile).toBeTruthy();
		});

		it("should create all expected default scripts", async () => {
			await manager.onload();

			const expectedScripts = [
				"zk-research-quick-actions.js",
				"zk-research-ai-pipeline.js",
				"zk-research-atomic-notes.js",
				"zk-research-materials.js",
				"zk-research-gantt.js",
				"zk-research-objectives.js",
				"zk-research-steps.js",
				"zk-research-objective-steps.js",
				"zk-research-experiments.js",
				"zk-research-requirements.js",
				"zk-project-quick-actions.js",
				"zk-project-requirements.js",
				"zk-project-releases.js",
				"zk-project-commits.js",
			];

			for (const scriptName of expectedScripts) {
				const scriptFile = app.vault.getAbstractFileByPath(
					`${scriptsFolder}/${scriptName}`
				);
				expect(scriptFile).toBeTruthy();
			}
		});
	});

	// ==================== Script Loading ====================

	describe("loadAllScripts", () => {
		it("should load default scripts on init", async () => {
			await manager.onload();

			// Verify default scripts are loaded
			const script = manager.getScript("zk-research-quick-actions");
			expect(script).toBeDefined();
		});

		it("should load scripts by id", async () => {
			await manager.onload();

			const script = manager.getScript("zk-research-gantt");
			expect(script).toBeDefined();
			expect(script?.id).toBe("zk-research-gantt");
		});
	});

	// ==================== getScript ====================

	describe("getScript", () => {
		beforeEach(async () => {
			await manager.onload();
		});

		it("should return script by id", () => {
			const script = manager.getScript("zk-research-quick-actions");
			expect(script).toBeDefined();
			expect(script?.id).toBe("zk-research-quick-actions");
		});

		it("should return undefined for non-existent script", () => {
			const script = manager.getScript("non-existent-script");
			expect(script).toBeUndefined();
		});

		it("should return script with correct metadata", () => {
			const script = manager.getScript("zk-research-gantt");
			expect(script).toBeDefined();
			expect(script?.id).toBe("zk-research-gantt");
			expect(script?.name).toBeDefined();
			expect(typeof script?.filePath).toBe("string");
		});
	});

	// ==================== Script Content ====================

	describe("script content", () => {
		beforeEach(async () => {
			await manager.onload();
		});

		it("research-quick-actions should exist with metadata", () => {
			const script = manager.getScript("zk-research-quick-actions");
			expect(script).toBeDefined();
			expect(script?.id).toBe("zk-research-quick-actions");
			expect(script?.name).toBe("Research Quick Actions");
		});

		it("project-quick-actions should exist with metadata", () => {
			const script = manager.getScript("zk-project-quick-actions");
			expect(script).toBeDefined();
			expect(script?.id).toBe("zk-project-quick-actions");
			expect(script?.name).toBe("Project Quick Actions");
		});

		it("research-gantt should exist with metadata", () => {
			const script = manager.getScript("zk-research-gantt");
			expect(script).toBeDefined();
			expect(script?.id).toBe("zk-research-gantt");
			expect(script?.name).toBe("Research Gantt");
		});

		it("all default scripts should have valid metadata", () => {
			const defaultScriptIds = [
				"zk-research-quick-actions",
				"zk-research-gantt",
				"zk-project-quick-actions",
				"zk-project-requirements",
			];

			for (const id of defaultScriptIds) {
				const script = manager.getScript(id);
				expect(script).toBeDefined();
				expect(script?.id).toBe(id);
				expect(script?.filePath).toBeDefined();
			}
		});
	});

	// ==================== Overwrite Behavior ====================

	describe("overwrite behavior", () => {
		it("should create scripts that do not exist", async () => {
			await manager.onload();

			const scriptFile = app.vault.getAbstractFileByPath(
				`${scriptsFolder}/zk-research-gantt.js`
			);
			expect(scriptFile).toBeTruthy();
		});

		it("should preserve user-created scripts", async () => {
			await app.vault.createFolder(scriptsFolder);
			await app.vault.create(
				`${scriptsFolder}/user-custom.js`,
				"// user content"
			);

			await manager.onload();

			const content = (app.vault as any)._getContent(
				`${scriptsFolder}/user-custom.js`
			);
			expect(content).toBe("// user content");
		});
	});

	// ==================== File Watching ====================

	describe("file watching", () => {
		it("should register file watchers on load", async () => {
			const onSpy = jest.spyOn(app.vault, "on");

			await manager.onload();

			expect(onSpy).toHaveBeenCalled();
		});
	});

	// ==================== unload ====================

	describe("unload", () => {
		it("should not throw on unload", async () => {
			await manager.onload();

			expect(() => manager.unload()).not.toThrow();
		});
	});
});
