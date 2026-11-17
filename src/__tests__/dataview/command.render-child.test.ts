/**
 * D8: each block gets a MarkdownRenderChild registered on the post-processor
 * context; Dataview runs the script with that child as its component, so the
 * script's resources are released when the block is re-rendered or closed.
 */

import { App, Component, MarkdownRenderChild } from "../../__mocks__/obsidian";
import {
	asObsidianApp,
	callPrivate,
	createMockApp,
	createMockSettings,
	clearVault,
	readPath,
} from "../../__mocks__/testHelpers";
import { DataviewCommand } from "../../dataview/command";
import { DataviewJSManager } from "../../dataview/manager";
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

/** The registered code block handler, called with plain stand-ins for Obsidian's element and context. */
type BlockHandler = (source: string, el: object, ctx: object) => unknown;

function registeredHandler(register: { mock: { calls: unknown[][] } }): BlockHandler {
	const handler: unknown = register.mock.calls[0]?.[1];
	if (typeof handler !== "function") {
		throw new TypeError("DataviewCommand registered no code block handler");
	}
	return (source, el, ctx) => Reflect.apply(handler, undefined, [source, el, ctx]);
}

async function setup(app: App) {
	const plugin = new MyPlugin(asObsidianApp(app), MANIFEST);
	plugin.settings = createMockSettings({
		dataviewQueryPath: "dataview-scripts",
		dataviewCodeBlockType: "zettelkasten-query",
	});
	const register = jest.spyOn(plugin, "registerMarkdownCodeBlockProcessor");
	const exec = jest
		.spyOn(DataviewJSManager.prototype, "executeScript")
		.mockResolvedValue(undefined);
	const cmd = new DataviewCommand(asObsidianApp(app), plugin);
	await cmd.initialize();
	return { cmd, exec, handler: registeredHandler(register) };
}

describe("DataviewCommand render child (D8)", () => {
	let app: App;

	beforeEach(() => {
		app = createMockApp();
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
		jest.restoreAllMocks();
		clearVault(app.vault);
	});

	it("registers a MarkdownRenderChild for the block synchronously and passes it to executeScript", async () => {
		const { exec, handler } = await setup(app);
		const el = { isConnected: true };
		const ctx = {
			sourcePath: "Note.md",
			getSectionInfo: () => ({ lineStart: 3 }),
			addChild: jest.fn(),
		};

		handler("my-script\nn: 1", el, ctx);

		expect(ctx.addChild).toHaveBeenCalledTimes(1);
		const child: unknown = ctx.addChild.mock.calls[0][0];
		expect(child).toBeInstanceOf(MarkdownRenderChild);
		expect(readPath(child, "containerEl")).toBe(el);

		await jest.advanceTimersByTimeAsync(2000);

		expect(exec).toHaveBeenCalledTimes(1);
		const [scriptId, container, params, passedCtx, component] = exec.mock.calls[0];
		expect(scriptId).toBe("my-script");
		expect(container).toBe(el);
		expect(params).toEqual({ n: 1 });
		expect(passedCtx).toBe(ctx);
		expect(component).toBe(child);
	});

	it("passes undefined as the component when the context has no addChild", async () => {
		const { exec, handler } = await setup(app);

		handler("my-script", { isConnected: true }, { sourcePath: "Note.md" });
		await jest.advanceTimersByTimeAsync(2000);

		expect(exec).toHaveBeenCalledTimes(1);
		expect(exec.mock.calls[0][4]).toBeUndefined();
	});
});

describe("DataviewJSManager.executeScript component (D8)", () => {
	let app: App;
	let manager: DataviewJSManager;
	let executeJs: jest.Mock;
	const el = { setText: jest.fn() };

	beforeEach(async () => {
		app = createMockApp();
		manager = new DataviewJSManager(asObsidianApp(app), "dataview-scripts");
		await manager.onload();
		executeJs = jest.fn().mockResolvedValue(undefined);
		app.plugins = { plugins: { dataview: { api: { executeJs } } } };
	});

	afterEach(() => {
		clearVault(app.vault);
	});

	it("hands the given component to Dataview's executeJs", async () => {
		const component = new Component();

		await callPrivate(
			manager,
			"executeScript",
			"zk-research-objectives",
			el,
			{},
			{ sourcePath: "P/Dashboard.md" },
			component
		);

		expect(executeJs).toHaveBeenCalledTimes(1);
		expect(executeJs).toHaveBeenCalledWith(
			expect.any(String),
			el,
			component,
			"P/Dashboard.md"
		);
	});

	it("falls back to the manager itself when no component is given", async () => {
		await callPrivate(
			manager,
			"executeScript",
			"zk-research-objectives",
			el,
			{},
			{ sourcePath: "P/Dashboard.md" },
			undefined
		);

		expect(executeJs).toHaveBeenCalledTimes(1);
		expect(executeJs.mock.calls[0][2]).toBe(manager);
	});
});
