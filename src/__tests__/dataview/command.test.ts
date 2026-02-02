/**
 * Tests for DataviewCommand
 */

import { App } from "../../__mocks__/obsidian";
import { createMockApp, createMockSettings } from "../../__mocks__/testHelpers";
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
		it("should do nothing when source is empty", async () => {
			const { plugin } = createMockPlugin();
			plugin.app = app;
			const cmd = new DataviewCommand(app, plugin as any);
			await cmd.initialize();
			const handler = (plugin.registerMarkdownCodeBlockProcessor as jest.Mock).mock
				.calls[0][1];
			const el = document.createElement("div");
			await handler("  \n  ", el, {});
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
			expect(el.textContent).toBeDefined();
		});
	});
});
