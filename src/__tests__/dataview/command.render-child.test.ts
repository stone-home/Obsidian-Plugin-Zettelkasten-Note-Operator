/**
 * D8: each block gets a MarkdownRenderChild registered on the post-processor
 * context; Dataview runs the script with that child as its component, so the
 * script's resources are released when the block is re-rendered or closed.
 */

import { App, Component, MarkdownRenderChild } from "../../__mocks__/obsidian";
import { createMockApp, createMockSettings, clearVault } from "../../__mocks__/testHelpers";
import { DataviewCommand } from "../../dataview/command";
import { DataviewJSManager } from "../../dataview/manager";

async function setup(app: App) {
	const plugin = {
		app,
		settings: createMockSettings({
			dataviewQueryPath: "dataview-scripts",
			dataviewCodeBlockType: "zettelkasten-query",
		}),
		registerMarkdownCodeBlockProcessor: jest.fn(),
	};
	const cmd = new DataviewCommand(app as any, plugin as any);
	await cmd.initialize();
	const exec = jest.fn().mockResolvedValue(undefined);
	(cmd as any).dataviewManager.executeScript = exec;
	const handler = plugin.registerMarkdownCodeBlockProcessor.mock.calls[0][1] as (
		source: string,
		el: any,
		ctx: any
	) => unknown;
	return { cmd, exec, handler };
}

describe("DataviewCommand render child (D8)", () => {
	let app: App;

	beforeEach(() => {
		app = createMockApp();
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
		clearVault(app.vault);
	});

	it("registers a MarkdownRenderChild for the block synchronously and passes it to executeScript", async () => {
		const { exec, handler } = await setup(app);
		const el = { isConnected: true };
		const ctx = { sourcePath: "Note.md", getSectionInfo: () => ({ lineStart: 3 }), addChild: jest.fn() };

		handler("my-script\nn: 1", el, ctx);

		expect(ctx.addChild).toHaveBeenCalledTimes(1);
		const child = ctx.addChild.mock.calls[0][0];
		expect(child).toBeInstanceOf(MarkdownRenderChild);
		expect(child.containerEl).toBe(el);

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
		manager = new DataviewJSManager(app as any, "dataview-scripts");
		await manager.onload();
		executeJs = jest.fn().mockResolvedValue(undefined);
		(app as any).plugins = { plugins: { dataview: { api: { executeJs } } } };
	});

	afterEach(() => {
		clearVault(app.vault);
	});

	it("hands the given component to Dataview's executeJs", async () => {
		const component = new Component();

		await (manager as any).executeScript("zk-research-objectives", el, {}, { sourcePath: "P/Dashboard.md" }, component);

		expect(executeJs).toHaveBeenCalledTimes(1);
		expect(executeJs).toHaveBeenCalledWith(expect.any(String), el, component, "P/Dashboard.md");
	});

	it("falls back to the manager itself when no component is given", async () => {
		await (manager as any).executeScript("zk-research-objectives", el, {}, { sourcePath: "P/Dashboard.md" }, undefined);

		expect(executeJs).toHaveBeenCalledTimes(1);
		expect(executeJs.mock.calls[0][2]).toBe(manager);
	});
});
