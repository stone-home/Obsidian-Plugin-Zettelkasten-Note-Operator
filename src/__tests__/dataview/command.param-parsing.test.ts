/**
 * D2: block parameters split at the first ":" or "=" only, so values may contain
 * either character; JSON values are still parsed.
 */

import { createMockSettings, createObsidianApp } from "../../__mocks__/testHelpers";
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
	return { exec, handler: registeredHandler(register) };
}

describe("DataviewCommand block parameter parsing (D2)", () => {
	beforeEach(() => {
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
		jest.restoreAllMocks();
	});

	it("keeps '=' and ':' inside values and still parses JSON values", async () => {
		const { exec, handler } = await setup();

		handler(
			"my-script\nfilter: a=b\nurl: http://x.org/a\nn = 3",
			{ isConnected: true },
			{ sourcePath: "Note.md" }
		);
		await jest.advanceTimersByTimeAsync(1000);

		expect(exec).toHaveBeenCalledTimes(1);
		expect(exec.mock.calls[0][0]).toBe("my-script");
		expect(exec.mock.calls[0][2]).toEqual({
			filter: "a=b",
			url: "http://x.org/a",
			n: 3,
		});
	});

	it("splits at the first separator only, whichever it is", async () => {
		const { exec, handler } = await setup();

		handler(
			'my-script\nexpr = a:b=c\nlist: ["x", "y"]',
			{ isConnected: true },
			{ sourcePath: "Note.md" }
		);
		await jest.advanceTimersByTimeAsync(1000);

		expect(exec.mock.calls[0][2]).toEqual({ expr: "a:b=c", list: ["x", "y"] });
	});
});
