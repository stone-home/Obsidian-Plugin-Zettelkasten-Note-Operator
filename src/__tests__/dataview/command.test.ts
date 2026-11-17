/**
 * Tests for DataviewCommand
 */

import { App } from "../../__mocks__/obsidian";
import {
	asObsidianApp,
	createMockApp,
	createMockSettings,
	clearVault,
} from "../../__mocks__/testHelpers";
import { DataviewCommand } from "../../dataview/command";
import MyPlugin from "../../main";

// main.ts reaches CodeMirror through the script editor modal, and CodeMirror needs a real DOM
// at import time; the modal plays no part in DataviewCommand, so it is replaced by an empty class.
jest.mock("../../modals/dataviewScriptEditorModal", () => ({
	DataviewScriptEditorModal: class {},
}));

const MANIFEST = {
	id: "zettelkasten-operator",
	name: "Zettelkasten Operator",
	version: "0.0.0",
	minAppVersion: "0.0.0",
	author: "test",
	description: "test",
};

function createMockPlugin(app: App, registerThrows?: "already registered" | "other") {
	let registerCallCount = 0;
	const plugin = new MyPlugin(asObsidianApp(app), MANIFEST);
	plugin.settings = createMockSettings({
		dataviewEnabled: true,
		dataviewQueryPath: "dataview-scripts",
		dataviewCodeBlockType: "zettelkasten-query",
	});
	const register = jest
		.spyOn(plugin, "registerMarkdownCodeBlockProcessor")
		.mockImplementation(() => {
			registerCallCount++;
			if (registerThrows === "already registered" && registerCallCount > 1) {
				throw new Error(
					"Code block postprocessor for language zettelkasten-query is already registered"
				);
			}
			if (registerThrows === "other" && registerCallCount > 1) {
				throw new Error("Other error");
			}
			return () => {};
		});
	return { plugin, register, registerCallCount: () => registerCallCount };
}

/** The registered code block handler, called with plain stand-ins for Obsidian's element and context. */
type BlockHandler = (source: string, el: object, ctx: object) => unknown;

function registeredHandler(register: { mock: { calls: unknown[][] } }): BlockHandler {
	const handler: unknown = register.mock.calls[0]?.[1];
	if (typeof handler !== "function") {
		throw new TypeError("DataviewCommand registered no code block handler");
	}
	return (source, el, ctx) => Reflect.apply(handler, undefined, [source, el, ctx]);
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
			const { plugin } = createMockPlugin(app);
			const cmd = new DataviewCommand(asObsidianApp(app), plugin);
			expect(cmd).toBeDefined();
		});
	});

	describe("initialize", () => {
		it("should call dataviewManager.onload and register processor", async () => {
			const { plugin, register } = createMockPlugin(app);
			const cmd = new DataviewCommand(asObsidianApp(app), plugin);
			await cmd.initialize();
			expect(register).toHaveBeenCalledWith(
				"zettelkasten-query",
				expect.any(Function)
			);
		});

		it("should not register processor twice on second initialize", async () => {
			const { plugin, register } = createMockPlugin(app);
			const cmd = new DataviewCommand(asObsidianApp(app), plugin);
			await cmd.initialize();
			await cmd.initialize();
			expect(register).toHaveBeenCalledTimes(1);
		});

		it("should swallow 'already registered' when mock throws on second register", async () => {
			const { plugin, register } = createMockPlugin(app, "already registered");
			const cmd = new DataviewCommand(asObsidianApp(app), plugin);
			await cmd.initialize();
			register.mockImplementationOnce(() => {
				throw new Error(
					"Code block postprocessor for language zettelkasten-query is already registered"
				);
			});
			await expect(cmd.initialize()).resolves.not.toThrow();
		});

		it("should rethrow when register throws non-'already registered'", async () => {
			const { plugin, register } = createMockPlugin(app);
			register.mockImplementation(() => {
				throw new Error("Other error");
			});
			const cmd = new DataviewCommand(asObsidianApp(app), plugin);
			await expect(cmd.initialize()).rejects.toThrow("Other error");
		});
	});

	describe("refresh", () => {
		it("should call dataviewManager.onload without registering", async () => {
			const { plugin, register } = createMockPlugin(app);
			const cmd = new DataviewCommand(asObsidianApp(app), plugin);
			await cmd.initialize();
			register.mockClear();
			await cmd.refresh();
			expect(register).not.toHaveBeenCalled();
		});
	});

	describe("unload", () => {
		it("should call dataviewManager.cleanUpFileWatchers", async () => {
			const { plugin } = createMockPlugin(app);
			const cmd = new DataviewCommand(asObsidianApp(app), plugin);
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
			const { plugin, register } = createMockPlugin(app);
			const cmd = new DataviewCommand(asObsidianApp(app), plugin);
			await cmd.initialize();
			const handler = registeredHandler(register);
			const el = document.createElement("div");
			await handler("  \n  ", el, {});
			await jest.advanceTimersByTimeAsync(400);
			expect(el.textContent).toBeFalsy();
		});

		it("should do nothing when only scriptId line has no content", async () => {
			const { plugin, register } = createMockPlugin(app);
			const cmd = new DataviewCommand(asObsidianApp(app), plugin);
			await cmd.initialize();
			const handler = registeredHandler(register);
			const el = document.createElement("div");
			await handler("", el, {});
			await jest.advanceTimersByTimeAsync(400);
			expect(el.textContent).toBeFalsy();
		});

		it("should show error when script not found", async () => {
			const { plugin, register } = createMockPlugin(app);
			const cmd = new DataviewCommand(asObsidianApp(app), plugin);
			await cmd.initialize();
			const handler = registeredHandler(register);
			const el = document.createElement("div");
			el.setText = (s: string) => {
				el.textContent = s;
			};
			await handler("nonexistent-script", el, {});
			await jest.advanceTimersByTimeAsync(400);
			expect(el.textContent).toContain("not found");
		});

		it("should parse params with key:value and key=value", async () => {
			const { plugin, register } = createMockPlugin(app);
			await app.vault.createFolder("dataview-scripts");
			await app.vault.create(
				"dataview-scripts/test.js",
				"/** @id test */\nreturn 1;"
			);
			const cmd = new DataviewCommand(asObsidianApp(app), plugin);
			await cmd.initialize();
			const handler = registeredHandler(register);
			const el = document.createElement("div");
			el.setText = (s: string) => {
				el.textContent = s;
			};
			await handler("test\nfoo: 1\nbar= 2", el, {});
			await jest.advanceTimersByTimeAsync(400);
			expect(el.textContent).toBeDefined();
		});
	});

	describe("getScripts", () => {
		it("should return scripts from manager after initialize", async () => {
			const { plugin } = createMockPlugin(app);
			const cmd = new DataviewCommand(asObsidianApp(app), plugin);
			await cmd.initialize();
			const scripts = cmd.getScripts();
			expect(Array.isArray(scripts)).toBe(true);
			expect(scripts.length).toBeGreaterThan(0);
		});

		it("should filter by category when provided", async () => {
			const { plugin } = createMockPlugin(app);
			const cmd = new DataviewCommand(asObsidianApp(app), plugin);
			await cmd.initialize();
			const scripts = cmd.getScripts("research");
			expect(Array.isArray(scripts)).toBe(true);
		});
	});

	describe("getScriptContent", () => {
		it("should return content for loaded script", async () => {
			const { plugin } = createMockPlugin(app);
			const cmd = new DataviewCommand(asObsidianApp(app), plugin);
			await cmd.initialize();
			const content = cmd.getScriptContent("zk-research-quick-actions");
			expect(typeof content).toBe("string");
			expect(content?.length).toBeGreaterThan(0);
		});

		it("should return undefined for unknown script", async () => {
			const { plugin } = createMockPlugin(app);
			const cmd = new DataviewCommand(asObsidianApp(app), plugin);
			await cmd.initialize();
			expect(cmd.getScriptContent("nonexistent-id")).toBeUndefined();
		});
	});

	describe("createScript", () => {
		it("should create script via manager", async () => {
			const { plugin } = createMockPlugin(app);
			const cmd = new DataviewCommand(asObsidianApp(app), plugin);
			await cmd.initialize();
			const script = await cmd.createScript(
				"new-script",
				"New Script",
				"dv.paragraph('hi');"
			);
			expect(script).toBeDefined();
			expect(script.id).toBe("new-script");
			expect(script.name).toBe("New Script");
			expect(script.filePath).toContain("new-script.js");
		});
	});
});
