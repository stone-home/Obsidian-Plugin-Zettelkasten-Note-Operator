/**
 * Tests for DataviewJSManager
 */

import { App, TFile } from "../../__mocks__/obsidian";
import {
	createMockApp,
	clearVault,
	populateVault,
} from "../../__mocks__/testHelpers";
import {
	DataviewJSManager,
	getDefaultScriptContent,
} from "../../dataview/manager";

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
				"zk-research-ai-pipeline-tracking.js",
				"zk-research-ai-pipeline.js",
				"zk-research-atomic-notes.js",
				"zk-research-materials.js",
				"zk-research-gantt.js",
				"zk-research-objectives.js",
				"zk-research-steps.js",
				"zk-research-objective-steps.js",
				"zk-research-experiments.js",
				"zk-research-requirements.js",
				"zk-research-target-conference.js",
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

		it("zk-research-ai-pipeline-tracking should include Copies and last-prompt-by-filename logic", () => {
			const content = getDefaultScriptContent("zk-research-ai-pipeline-tracking");
			expect(content).toBeTruthy();
			// Pre-index prompts by draft stem (performance)
			expect(content).toContain("promptMap");
			// Parse prompt filenames to count copies per draft
			expect(content).toContain("_prompt_v");
			// Sort by filename descending so "last" is semantic (not mtime)
			expect(content).toContain("localeCompare");
			// Table columns: Copies, Last prompt date, Last prompt link
			expect(content).toContain("'Copies'");
			expect(content).toContain("'Last prompt date'");
			expect(content).toContain("'Last prompt'");
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

	// ==================== getScripts ====================

	describe("getScripts", () => {
		beforeEach(async () => {
			await manager.onload();
		});

		it("should return all scripts when no category", () => {
			const scripts = manager.getScripts();
			expect(Array.isArray(scripts)).toBe(true);
			expect(scripts.length).toBeGreaterThan(0);
		});

		it("should filter by category when provided", () => {
			const scripts = manager.getScripts("research");
			expect(Array.isArray(scripts)).toBe(true);
		});
	});

	// ==================== exportScriptsManifest ====================

	describe("exportScriptsManifest", () => {
		beforeEach(async () => {
			await manager.onload();
		});

		it("should return JSON string of scripts", () => {
			const manifest = manager.exportScriptsManifest();
			expect(typeof manifest).toBe("string");
			const parsed = JSON.parse(manifest);
			expect(Array.isArray(parsed)).toBe(true);
		});
	});

	// ==================== executeScript ====================

	describe("executeScript", () => {
		beforeEach(async () => {
			await manager.onload();
		});

		it("should set error text when script not found", async () => {
			const el = document.createElement("div") as HTMLElement & {
				setText?(s: string): void;
			};
			el.setText = (s: string) => {
				el.textContent = s;
			};
			await manager.executeScript("nonexistent-script", el, {});
			expect(el.textContent).toContain("not found");
		});

		it("should set error text when Dataview plugin not available", async () => {
			const el = document.createElement("div") as HTMLElement & {
				setText?(s: string): void;
			};
			el.setText = (s: string) => {
				el.textContent = s;
			};
			(app as any).plugins = { plugins: {} };
			await manager.executeScript("zk-research-quick-actions", el, {});
			expect(el.textContent).toContain("Dataview");
		});

		it("should call executeJs when Dataview API available", async () => {
			const el = document.createElement("div") as HTMLElement & {
				setText?(s: string): void;
			};
			el.setText = (s: string) => {
				el.textContent = s;
			};
			const executeJs = jest.fn().mockResolvedValue(undefined);
			(app as any).plugins = {
				plugins: {
					dataview: { api: { executeJs } },
				},
			};
			await manager.executeScript("zk-research-quick-actions", el, {}, { sourcePath: "test.md" });
			expect(executeJs).toHaveBeenCalled();
		});

		it("should set error text when executeJs rejects", async () => {
			const el = document.createElement("div") as HTMLElement & {
				setText?(s: string): void;
			};
			el.setText = (s: string) => {
				el.textContent = s;
			};
			const executeJs = jest.fn().mockRejectedValue(new Error("Dataview execution failed"));
			(app as any).plugins = {
				plugins: {
					dataview: { api: { executeJs } },
				},
			};
			await manager.executeScript("zk-research-quick-actions", el, {}, { sourcePath: "test.md" });
			expect(el.textContent).toContain("Error:");
			expect(el.textContent).toContain("Dataview execution failed");
		});
	});

	// ==================== createScript (overwrite) ====================

	describe("createScript overwrite", () => {
		beforeEach(async () => {
			await manager.onload();
		});

		it("should overwrite existing script when overwrite true", async () => {
			await manager.createScript(
				"zk-research-quick-actions",
				"Overwritten",
				"return 42;",
				{ overwrite: true }
			);
			const script = manager.getScript("zk-research-quick-actions");
			expect(script?.name).toBe("Overwritten");
			const content = (app.vault as any)._getContent(
				`${scriptsFolder}/zk-research-quick-actions.js`
			);
			expect(content).toContain("return 42;");
		});
	});

	// ==================== createScriptBuilder ====================

	describe("createScriptBuilder", () => {
		it("should return a builder instance", async () => {
			await manager.onload();
			const builder = manager.createScriptBuilder();
			expect(builder).toBeDefined();
			expect(typeof builder.build).toBe("function");
		});
	});

	// ==================== setScriptsFolder ====================

	describe("setScriptsFolder", () => {
		it("should clear scripts and cache so getScripts returns empty", async () => {
			await manager.onload();
			expect(manager.getScripts().length).toBeGreaterThan(0);
			manager.setScriptsFolder("other-folder");
			expect(manager.getScripts().length).toBe(0);
			expect(manager.getScriptContent("zk-research-quick-actions")).toBeUndefined();
		});
	});

	// ==================== getScriptContent ====================

	describe("getScriptContent", () => {
		beforeEach(async () => {
			await manager.onload();
		});

		it("should return cached content after load", () => {
			const content = manager.getScriptContent("zk-research-quick-actions");
			expect(content).toBeDefined();
			expect(typeof content).toBe("string");
			expect(content!.length).toBeGreaterThan(0);
		});

		it("should return undefined for unknown id", () => {
			expect(manager.getScriptContent("nonexistent-id")).toBeUndefined();
		});
	});
});

// ==================== getDefaultScriptContent ====================

describe("getDefaultScriptContent", () => {
	beforeAll(async () => {
		const app = createMockApp();
		const m = new DataviewJSManager(app, "dataview-scripts");
		await m.onload();
	});

	it("should return content for predefined script id", () => {
		const content = getDefaultScriptContent("zk-research-quick-actions");
		expect(content).toBeTruthy();
		expect(typeof content).toBe("string");
	});

	it("should return null for non-predefined id", () => {
		const content = getDefaultScriptContent("user-custom-script");
		expect(content).toBeNull();
	});
});
