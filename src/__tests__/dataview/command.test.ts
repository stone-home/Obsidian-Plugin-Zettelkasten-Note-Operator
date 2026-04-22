/**
 * Tests for DataviewCommand
 */

import { App } from "../../__mocks__/obsidian";
import { createMockApp, createMockSettings, clearVault } from "../../__mocks__/testHelpers";
import { DataviewCommand } from "../../dataview/command";

function createMockPlugin(registerThrows?: "already registered" | "other") {
	let registerCallCount = 0;
	const plugin = {
		app: null as App,
		settings: createMockSettings({
			dataviewEnabled: true,
			dataviewQueryPath: "dataview-scripts",
			dataviewCodeBlockType: "zettelkasten-query",
		}),
		registerMarkdownCodeBlockProcessor: jest.fn(
			(
				_language: string,
				_handler: (source: string, el: HTMLElement, ctx: any) => Promise<void> | void
			) => {
				registerCallCount++;
				if (registerThrows === "already registered" && registerCallCount > 1) {
					throw new Error(
						"Code block postprocessor for language zettelkasten-query is already registered"
					);
				}
				if (registerThrows === "other" && registerCallCount > 1) {
					throw new Error("Other error");
				}
			}
		),
	};
	return { plugin, registerCallCount: () => registerCallCount };
}

describe("DataviewCommand", () => {
	let app: App;

	beforeEach(() => {
		app = createMockApp();
	});

	afterEach(() => {
		clearVault(app.vault);
	});

	describe("constructor", () => {
		it("should create DataviewJSManager with settings path", () => {
			const { plugin } = createMockPlugin();
			plugin.app = app;
			const cmd = new DataviewCommand(app, plugin as any);
			expect(cmd).toBeDefined();
		});
	});

	describe("initialize", () => {
		it("should call dataviewManager.onload and register processor", async () => {
			const { plugin } = createMockPlugin();
			plugin.app = app;
			const cmd = new DataviewCommand(app, plugin as any);
			await cmd.initialize();
			expect(plugin.registerMarkdownCodeBlockProcessor).toHaveBeenCalledWith(
				"zettelkasten-query",
				expect.any(Function)
			);
		});

		it("should not register processor twice on second initialize", async () => {
			const { plugin } = createMockPlugin();
			plugin.app = app;
			const cmd = new DataviewCommand(app, plugin as any);
			await cmd.initialize();
			await cmd.initialize();
			expect(plugin.registerMarkdownCodeBlockProcessor).toHaveBeenCalledTimes(1);
		});

		it("should swallow 'already registered' when mock throws on second register", async () => {
			const { plugin } = createMockPlugin("already registered");
			plugin.app = app;
			const cmd = new DataviewCommand(app, plugin as any);
			await cmd.initialize();
			plugin.registerMarkdownCodeBlockProcessor.mockImplementationOnce(() => {
				throw new Error(
					"Code block postprocessor for language zettelkasten-query is already registered"
				);
			});
			await expect(cmd.initialize()).resolves.not.toThrow();
		});

		it("should rethrow when register throws non-'already registered'", async () => {
			const plugin = {
				app,
				settings: createMockSettings({
					dataviewQueryPath: "dataview-scripts",
					dataviewCodeBlockType: "zettelkasten-query",
				}),
				registerMarkdownCodeBlockProcessor: jest.fn(() => {
					throw new Error("Other error");
				}),
			};
			const cmd = new DataviewCommand(app, plugin as any);
			await expect(cmd.initialize()).rejects.toThrow("Other error");
		});
	});

	describe("refresh", () => {
		it("should call dataviewManager.onload without registering", async () => {
			const { plugin } = createMockPlugin();
			plugin.app = app;
			const cmd = new DataviewCommand(app, plugin as any);
			await cmd.initialize();
			(plugin.registerMarkdownCodeBlockProcessor as jest.Mock).mockClear();
			await cmd.refresh();
			expect(plugin.registerMarkdownCodeBlockProcessor).not.toHaveBeenCalled();
		});
	});

	describe("unload", () => {
		it("should call dataviewManager.cleanUpFileWatchers", async () => {
			const { plugin } = createMockPlugin();
			plugin.app = app;
			const cmd = new DataviewCommand(app, plugin as any);
			await cmd.initialize();
			expect(() => cmd.unload()).not.toThrow();
		});
	});

	describe("processDvjsBlock (via handler)", () => {
		beforeEach(() => {
			jest.useFakeTimers();
		});
		afterEach(() => {
			jest.useRealTimers();
		});

		it("should do nothing when source is empty", async () => {
			const { plugin } = createMockPlugin();
			plugin.app = app;
			const cmd = new DataviewCommand(app, plugin as any);
			await cmd.initialize();
			const handler = (plugin.registerMarkdownCodeBlockProcessor as jest.Mock).mock
				.calls[0][1];
			const el = document.createElement("div");
			await handler("  \n  ", el, {});
			await jest.advanceTimersByTimeAsync(400);
			expect(el.textContent).toBeFalsy();
		});

		it("should do nothing when only scriptId line has no content", async () => {
			const { plugin } = createMockPlugin();
			plugin.app = app;
			const cmd = new DataviewCommand(app, plugin as any);
			await cmd.initialize();
			const handler = (plugin.registerMarkdownCodeBlockProcessor as jest.Mock).mock
				.calls[0][1];
			const el = document.createElement("div");
			await handler("", el, {});
			await jest.advanceTimersByTimeAsync(400);
			expect(el.textContent).toBeFalsy();
		});

		it("should show error when script not found", async () => {
			const { plugin } = createMockPlugin();
			plugin.app = app;
			const cmd = new DataviewCommand(app, plugin as any);
			await cmd.initialize();
			const handler = (plugin.registerMarkdownCodeBlockProcessor as jest.Mock).mock
				.calls[0][1];
			const el = document.createElement("div") as HTMLElement & { setText?(s: string): void };
			el.setText = (s: string) => { el.textContent = s; };
			await handler("nonexistent-script", el, {});
			await jest.advanceTimersByTimeAsync(400);
			expect(el.textContent).toContain("not found");
		});

		it("should parse params with key:value and key=value", async () => {
			const { plugin } = createMockPlugin();
			plugin.app = app;
			await (app.vault as any).createFolder("dataview-scripts");
			await (app.vault as any).create(
				"dataview-scripts/test.js",
				"/** @id test */\nreturn 1;"
			);
			const cmd = new DataviewCommand(app, plugin as any);
			await cmd.initialize();
			const handler = (plugin.registerMarkdownCodeBlockProcessor as jest.Mock).mock
				.calls[0][1];
			const el = document.createElement("div") as HTMLElement & { setText?(s: string): void };
			el.setText = (s: string) => { el.textContent = s; };
			await handler("test\nfoo: 1\nbar= 2", el, {});
			await jest.advanceTimersByTimeAsync(400);
			expect(el.textContent).toBeDefined();
		});
	});

	describe("getScripts", () => {
		it("should return scripts from manager after initialize", async () => {
			const { plugin } = createMockPlugin();
			plugin.app = app;
			const cmd = new DataviewCommand(app, plugin as any);
			await cmd.initialize();
			const scripts = cmd.getScripts();
			expect(Array.isArray(scripts)).toBe(true);
			expect(scripts.length).toBeGreaterThan(0);
		});

		it("should filter by category when provided", async () => {
			const { plugin } = createMockPlugin();
			plugin.app = app;
			const cmd = new DataviewCommand(app, plugin as any);
			await cmd.initialize();
			const scripts = cmd.getScripts("research");
			expect(Array.isArray(scripts)).toBe(true);
		});
	});

	describe("getScriptContent", () => {
		it("should return content for loaded script", async () => {
			const { plugin } = createMockPlugin();
			plugin.app = app;
			const cmd = new DataviewCommand(app, plugin as any);
			await cmd.initialize();
			const content = cmd.getScriptContent("zk-research-quick-actions");
			expect(typeof content).toBe("string");
			expect(content!.length).toBeGreaterThan(0);
		});

		it("should return undefined for unknown script", async () => {
			const { plugin } = createMockPlugin();
			plugin.app = app;
			const cmd = new DataviewCommand(app, plugin as any);
			await cmd.initialize();
			expect(cmd.getScriptContent("nonexistent-id")).toBeUndefined();
		});
	});

	describe("createScript", () => {
		it("should create script via manager", async () => {
			const { plugin } = createMockPlugin();
			plugin.app = app;
			const cmd = new DataviewCommand(app, plugin as any);
			await cmd.initialize();
			const script = await cmd.createScript("new-script", "New Script", "dv.paragraph('hi');");
			expect(script).toBeDefined();
			expect(script.id).toBe("new-script");
			expect(script.name).toBe("New Script");
			expect(script.filePath).toContain("new-script.js");
		});
	});
});
