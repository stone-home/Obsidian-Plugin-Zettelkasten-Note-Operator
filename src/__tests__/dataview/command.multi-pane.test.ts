/**
 * D6: the same block shown in two panes renders in both; a Live Preview
 * re-render (old element detached) still supersedes the old element.
 */

import {
	createMockSettings,
	createObsidianApp,
	privateMember,
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

function pendingEntryCount(cmd: DataviewCommand): number {
	const pending = privateMember(cmd, "pendingDvjsByKey");
	if (!(pending instanceof Map)) throw new TypeError("pendingDvjsByKey is not a Map");
	return pending.size;
}

async function setup() {
	const { app } = createObsidianApp();
	const plugin = new MyPlugin(app, MANIFEST);
	plugin.settings = createMockSettings({
		dataviewQueryPath: "dataview-scripts",
		dataviewCodeBlockType: "zettelkasten-query",
	});
	const register = jest.spyOn(plugin, "registerMarkdownCodeBlockProcessor");
	const exec = jest
		.spyOn(DataviewJSManager.prototype, "executeScript")
		.mockResolvedValue(undefined);
	const cmd = new DataviewCommand(app, plugin);
	await cmd.initialize();
	return { cmd, exec, handler: registeredHandler(register) };
}

const sameBlockCtx = () => ({
	sourcePath: "Same.md",
	getSectionInfo: () => ({ lineStart: 5 }),
});

describe("DataviewCommand with several panes (D6)", () => {
	beforeEach(() => {
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
		jest.restoreAllMocks();
	});

	it("renders into both connected elements of the same block scheduled within the debounce window", async () => {
		const { exec, handler } = await setup();
		const pane1 = { isConnected: true, pane: 1 };
		const pane2 = { isConnected: true, pane: 2 };

		handler("my-script", pane1, sameBlockCtx());
		await jest.advanceTimersByTimeAsync(100);
		handler("my-script", pane2, sameBlockCtx());
		await jest.advanceTimersByTimeAsync(2000);

		const renderedInto = exec.mock.calls.map((call) => call[1]);
		expect(renderedInto).toContain(pane1);
		expect(renderedInto).toContain(pane2);
	});

	it("Live Preview re-render: a detached element is superseded by its replacement", async () => {
		const { exec, handler } = await setup();
		const oldEl = { isConnected: true, which: "old" };
		const newEl = { isConnected: true, which: "new" };

		handler("my-script", oldEl, sameBlockCtx());
		await jest.advanceTimersByTimeAsync(100);
		oldEl.isConnected = false;
		handler("my-script", newEl, sameBlockCtx());
		await jest.advanceTimersByTimeAsync(2000);

		expect(exec).toHaveBeenCalledTimes(1);
		expect(exec.mock.calls[0][1]).toBe(newEl);
	});

	it("renders a never-connected element and leaves no pending entry", async () => {
		const { cmd, exec, handler } = await setup();
		const el = { isConnected: false, which: "reading" };

		handler("my-script", el, sameBlockCtx());
		await jest.advanceTimersByTimeAsync(2000);

		expect(exec).toHaveBeenCalledTimes(1);
		expect(exec.mock.calls[0][1]).toBe(el);
		expect(pendingEntryCount(cmd)).toBe(0);
	});
});
