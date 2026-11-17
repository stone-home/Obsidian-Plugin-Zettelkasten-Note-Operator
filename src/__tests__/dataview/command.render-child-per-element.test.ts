/**
 * DataviewCommand runs each rendered element with the render child registered for that same element, also with several panes and on the first-paint path.
 */

import { MarkdownRenderChild, type MarkdownPostProcessorContext } from "obsidian";
import {
	createMockSettings,
	createObsidianApp,
	privateMember,
} from "../../__mocks__/testHelpers";
import { DataviewCommand } from "../../dataview/command";
import { DataviewJSManager } from "../../dataview/manager";
import MyPlugin from "../../main";

// main.ts pulls in CodeMirror, which needs a real DOM; DataviewCommand only uses these plugin members.
jest.mock("../../main", () => ({
	__esModule: true,
	default: class {
		settings = {};
		registerMarkdownCodeBlockProcessor(): void {}
		async saveSettings(): Promise<void> {}
	},
}));

const MANIFEST = {
	id: "test-plugin",
	name: "Test Plugin",
	author: "test",
	version: "0.0.0",
	minAppVersion: "0.0.0",
	description: "test",
};

async function setup() {
	const { app } = createObsidianApp();
	const plugin = new MyPlugin(app, MANIFEST);
	plugin.settings = createMockSettings({
		dataviewQueryPath: "dataview-scripts",
		dataviewCodeBlockType: "zettelkasten-query",
	});
	const register = jest.spyOn(plugin, "registerMarkdownCodeBlockProcessor");
	const cmd = new DataviewCommand(app, plugin);
	await cmd.initialize();
	const manager = privateMember(cmd, "dataviewManager");
	if (!(manager instanceof DataviewJSManager)) {
		throw new TypeError("DataviewCommand has no DataviewJSManager");
	}
	const exec = jest.spyOn(manager, "executeScript").mockResolvedValue(undefined);
	const handler = register.mock.calls[0][1];
	return { exec, handler };
}

/** A block element; `connected` is whether it is in the document (Live Preview) or not yet (first paint). */
function blockElement(connected: boolean, id: string): HTMLElement {
	const el = document.createElement("div");
	el.id = id;
	Object.defineProperty(el, "isConnected", {
		value: connected,
		configurable: true,
	});
	return el;
}

describe("DataviewCommand render child per element", () => {
	beforeEach(() => jest.useFakeTimers());
	afterEach(() => jest.useRealTimers());

	it("two panes and one first-paint element: each runs with its own child", async () => {
		const { exec, handler } = await setup();
		const ctx = (): MarkdownPostProcessorContext => ({
			docId: "doc",
			sourcePath: "N.md",
			frontmatter: undefined,
			getSectionInfo: () => ({ text: "", lineStart: 1, lineEnd: 1 }),
			addChild: jest.fn(),
		});
		const a = blockElement(true, "a");
		const b = blockElement(true, "b");
		const c = blockElement(false, "c");

		void handler("my-script", a, ctx());
		void handler("my-script", b, ctx());
		void handler("my-script", c, ctx());
		await jest.advanceTimersByTimeAsync(2000);

		expect(exec).toHaveBeenCalledTimes(3);
		for (const call of exec.mock.calls) {
			const [, el, , , component] = call;
			expect(component).toBeDefined();
			expect(component).toBeInstanceOf(MarkdownRenderChild);
			if (!(component instanceof MarkdownRenderChild)) continue;
			expect(component.containerEl).toBe(el);
		}
	});
});
