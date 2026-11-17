/**
 * D5: once a scheduled render has run, its debounce entry is removed
 * (no per-block entries holding elements after rendering).
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

describe("DataviewCommand debounce bookkeeping (D5)", () => {
	beforeEach(() => {
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
		jest.restoreAllMocks();
	});

	it("leaves no pending entries after all scheduled renders ran", async () => {
		const { cmd, exec, handler } = await setup();

		for (let i = 0; i < 3; i++) {
			handler(
				"my-script",
				{ isConnected: true, n: i },
				{ sourcePath: `Live${i}.md`, getSectionInfo: () => ({ lineStart: 2 }) }
			);
		}
		for (let i = 0; i < 2; i++) {
			handler(
				"my-script",
				{ isConnected: false, n: i },
				{ sourcePath: `Reading${i}.md` }
			);
		}
		await jest.advanceTimersByTimeAsync(2000);

		expect(exec).toHaveBeenCalledTimes(5);
		expect(pendingEntryCount(cmd)).toBe(0);
	});
});
